import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { db, storage } from "../lib/firebase";
import { startTopUpCheckout } from "../lib/billing";
import { collection, addDoc, query, onSnapshot, doc, orderBy, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";
import type { Artwork, Mockup } from "../types";

export function MemberStudio() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    // State
    const [artworks, setArtworks] = useState<any[]>([]);
    const [selectedArtwork, setSelectedArtwork] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [topUpLoading, setTopUpLoading] = useState(false);
    const [mockups, setMockups] = useState<any[]>([]);
    const [credits, setCredits] = useState(0);
    const [loading, setLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);

    // Generation Options
    const [selectedProduct, setSelectedProduct] = useState<string>("wall");
    const [numVariations, setNumVariations] = useState(1);
    const [aspectRatio, setAspectRatio] = useState("1:1");
    const [customPrompt, setCustomPrompt] = useState("");

    // Modal State
    const [selectedMockupForView, setSelectedMockupForView] = useState<any | null>(null);
    const [showLowCreditsPopup, setShowLowCreditsPopup] = useState(false);
    const [userPlan, setUserPlan] = useState<string>("free");
    const [profileStatus, setProfileStatus] = useState<"idle" | "ensuring" | "ready" | "error">("idle");
    const ensureAttemptedRef = useRef(false);
    const computeCredits = (data: any) => {
        const monthly = typeof data?.monthlyCreditsRemaining === "number" ? data.monthlyCreditsRemaining : 0;
        const bonus = typeof data?.bonusCredits === "number" ? data.bonusCredits : 0;
        const creditsField = data?.credits;
        const total = (creditsField ?? (monthly + bonus)) || 0;
        return {
            total,
            monthly,
            bonus,
        };
    };

    const ensureProfile = useCallback(async (force = false) => {
        if (!user || (ensureAttemptedRef.current && !force)) return;
        ensureAttemptedRef.current = true;
        if (!user || (ensureAttemptedRef.current && !force)) return;
        ensureAttemptedRef.current = true;
        try {
            // Force refresh token if retrying
            const token = await user.getIdToken(force);
            const apiUrl = import.meta.env.PROD ? "/api/user/ensureProfile" : `${import.meta.env.VITE_API_BASE_URL}/user/ensureProfile`;
            const clientRequestId = crypto.randomUUID();
            const resp = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "X-Request-Id": clientRequestId,
                }
            });
            const text = await resp.text();
            let data: any = {};
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("[MemberStudio] ensureProfile: Response was not JSON", text.slice(0, 500));
            }

            if (resp.status >= 500) {
                // Gateway timeout: profile might be ready in background
                console.warn(`[MemberStudio] ensureProfile: Server/Gateway error (${resp.status}). Profile should appear shortly.`);
                setProfileStatus("idle"); // This allows the onSnapshot to take over
                return;
            }

            if (!resp.ok) {
                if (resp.status === 401 || resp.status === 403) {
                    setProfileError("Please log in again to set up your profile.");
                    setProfileStatus("error");
                } else if (resp.status === 404) {
                    setProfileError("Account found but not fully activated. Please contact support.");
                    setProfileStatus("error");
                } else {
                    const reqId = data.requestId || resp.headers.get("x-request-id");
                    const errMsg = data.message || data.error || "Setup failed";
                    setProfileError(`${errMsg}${reqId ? ` (Backend ID: ${reqId})` : ` (Client ID: ${clientRequestId})`}. Please refresh or contact support.`);
                    setProfileStatus("error");
                }
                return;
            }
            setProfileStatus("ready");
            setProfileError(null);
            console.log("[MemberStudio] Profile synced", { projectId: data.projectId, uid: user.uid });
        } catch (err) {
            console.error("[MemberStudio] ensureProfile error", err);
            setProfileError("Connection error while setting up your profile. Please try again.");
            setProfileStatus("error");
            setProfileStatus("error");
        } finally {
            // No-op
        }
    }, [user]);

    const retryEnsureProfile = async () => {
        ensureAttemptedRef.current = false;
        setProfileError(null);
        setProfileStatus("ensuring");
        await ensureProfile(true);
    };

    useEffect(() => {
        ensureAttemptedRef.current = false;
        setProfileStatus("idle");
        setProfileError(null);
    }, [user?.uid]);

    // Auth & Data Subscription
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            navigate("/login");
            return;
        }

        const userRef = doc(db, "users", user.uid);
        let missingLogged = false;
        let profileTimeout: ReturnType<typeof setTimeout> | null = null;

        const unsubUser = onSnapshot(userRef, async (docSnap) => {
            setLoading(false);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const creditInfo = computeCredits(data);
                const currentCredits = creditInfo.total;
                const plan = data.plan || "free";

                setCredits(currentCredits);
                setUserPlan(plan);
                setProfileError(null);
                setProfileStatus("ready");
                if (profileTimeout) {
                    clearTimeout(profileTimeout);
                    profileTimeout = null;
                }

                // Show low credits popup for free users when credits <= 4
                if (plan === "free" && currentCredits <= 4 && currentCredits > 0) {
                    setShowLowCreditsPopup(true);
                }
            } else {
                if (!missingLogged) {
                    console.warn("User profile missing, waiting for server-side creation...");
                    missingLogged = true;
                }
                setProfileStatus("ensuring");
                ensureProfile();
                if (!profileTimeout) {
                    profileTimeout = setTimeout(() => {
                        // Use functional update to check if we already have a specific error
                        setProfileError((currentErr: string | null) => {
                            if (currentErr && currentErr.includes("ID:")) return currentErr; // Keep specific error
                            return "Account setup is taking longer than expected. Please refresh or check connection.";
                        });
                        setProfileStatus((currentStatus: string) => {
                            if (currentStatus === "ready") return "ready";
                            return "error";
                        });
                    }, 15000);
                }
            }
        }, (error) => {
            setLoading(false);
            setProfileError("Unable to load your profile right now. Please try again.");
            setProfileStatus("error");
            console.error("[MemberStudio] Profile listener error", error);
        });

        // Subscribe to artworks
        const qArtworks = query(
            collection(db, "users", user.uid, "artworks"),
            orderBy("createdAt", "desc")
        );
        const unsubArtworks = onSnapshot(qArtworks, (snapshot) => {
            const arts = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Artwork[];
            setArtworks(arts);

            // Select the first artwork by default if none selected
            setSelectedArtwork(prev => {
                if (!prev && arts.length > 0) {
                    return arts[0].id;
                }
                return prev;
            });
        }, (error) => {
            console.error("[MemberStudio] Artworks listener error", error);
        });

        return () => {
            unsubUser();
            unsubArtworks();
            if (profileTimeout) clearTimeout(profileTimeout);
        };
    }, [user, authLoading, navigate, ensureProfile]); // Removed selectedArtwork from dependencies

    // Separate effect for mockups - always subscribe when we have a user
    useEffect(() => {
        if (authLoading || !user) {
            setMockups([]);
            return;
        }

        console.log(`[MemberStudio] Setting up mockups subscription for user ${user.uid}`);

        const q = query(
            collection(db, "users", user.uid, "mockups"),
            orderBy("createdAt", "desc")
        );

        const unsubMockups = onSnapshot(q, (snapshot) => {
            console.log(`[MemberStudio] onSnapshot fired! Got ${snapshot.docs.length} docs`);
            const results = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Mockup[];

            const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());
            console.log(`[MemberStudio] Setting ${uniqueResults.length} mockups to state`);
            setMockups(uniqueResults);
        }, (error) => {
            console.error("[MemberStudio] Failed to load mockups.", error);
        });

        return () => {
            console.log("[MemberStudio] Cleaning up mockups subscription");
            unsubMockups();
        };
    }, [user, authLoading]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || !user) return;
        setUploading(true);
        const file = e.target.files[0];
        const storageRef = ref(storage, `users/${user.uid}/artworks/${Date.now()}_${file.name}`);

        try {
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            await addDoc(collection(db, "users", user.uid, "artworks"), {
                url,
                name: file.name,
                createdAt: serverTimestamp(),
            });
        } catch (error: any) {
            console.error("Upload error details:", error);
            alert(`Failed to upload artwork: ${error.message || error.code}`);
        } finally {
            setUploading(false);
        }
    };

    const handleTopUp = async () => {
        if (!user) return;
        setTopUpLoading(true);
        try {
            await startTopUpCheckout(user);
        } catch (error: any) {
            console.error("[MemberStudio] Top-up error:", error);
            alert(error.message || "Failed to start checkout");
        } finally {
            setTopUpLoading(false);
        }
    };

    const handleGenerate = async () => {
        console.log("[MemberStudio] handleGenerate called!");
        console.log("[MemberStudio] selectedArtwork:", selectedArtwork);
        console.log("[MemberStudio] user:", user?.uid);
        console.log("[MemberStudio] selectedProduct:", selectedProduct);

        if (!selectedArtwork || !user) {
            console.log("[MemberStudio] Early return - missing artwork or user");
            return;
        }

        setGenerating(true);
        try {
            const token = await user.getIdToken();
            const selectedArtworkObj = artworks.find(a => a.id === selectedArtwork);
            const artworkUrl = selectedArtworkObj?.url;

            console.log("[MemberStudio] About to call API...");
            console.log("[MemberStudio] artworkId:", selectedArtwork);
            console.log("[MemberStudio] artworkUrl:", artworkUrl);
            console.log("[MemberStudio] product:", selectedProduct);
            console.log("[MemberStudio] API URL:", import.meta.env.VITE_API_BASE_URL);

            const apiUrl = import.meta.env.PROD
                ? "/api/generateMemberMockups"
                : `${import.meta.env.VITE_API_BASE_URL}/generateMemberMockups`;

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    artworkId: selectedArtwork,
                    artworkUrl, // Pass URL directly to bypass backend DB lookup if needed
                    product: selectedProduct,
                    aspectRatio,
                    numVariations,
                    customPrompt,
                }),
            });

            console.log("[MemberStudio] Response status:", response.status);

            // 1. Broadly handle server/hosting errors (500, 502, 504, etc.)
            if (response.status >= 500) {
                console.warn(`[MemberStudio] Server/Gateway error (${response.status}). Checking for background success via real-time listeners...`);
                // Give it a moment for the background process to finish/register in Firestore
                setTimeout(() => setGenerating(false), 3000);
                return;
            }

            // 2. Read the body as text first to avoid SyntaxError during blind .json() call
            const responseText = await response.text();
            let data: any = null;
            try {
                if (responseText) {
                    data = JSON.parse(responseText);
                }
            } catch (e) {
                console.warn("[MemberStudio] Failed to parse response as JSON:", responseText.slice(0, 500));
            }

            // 3. Handle non-200 responses that aren't 5xx (e.g., 400, 401, 403, 404)
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || `Server returned error ${response.status}`;
                throw new Error(errorMsg);
            }

            // 4. Handle 200 responses that might not be valid JSON (rare but possible with Hosting)
            if (!data) {
                console.warn("[MemberStudio] Success status but invalid/empty data. Continuing via listeners.");
                setTimeout(() => setGenerating(false), 2000);
                return;
            }
            console.log("[MemberStudio] Response data:", JSON.stringify(data, null, 2));

            if (data.ok) {
                console.log("[MemberStudio] Generation successful, results:", data.results?.length || 0);
                if (data.errors && data.errors.length > 0) {
                    const errorMessages = data.errors.map((e: any) => `${e.category}: ${e.message}`).join("\n");
                    alert(`Generated ${data.results.length} images, but some failed:\n${errorMessages}`);
                }
            } else {
                alert(`Generation failed: ${data.error}`);
            }
        } catch (error: any) {
            console.error("Generate error:", error);
            alert(`Generation failed: ${error.message}`);
        } finally {
            setGenerating(false);
        }
    };



    const handleDownload = async (url: string, filename: string) => {
        try {
            // Attempt to fetch and blob it to force download
            // Note: This requires CORS to be configured on the Storage bucket.
            // If CORS is not set, this fetch will fail, and we fall back to opening in a new tab.
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error("Fetch failed");

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.warn("Download fetch failed (likely CORS), falling back to new tab.");
            window.open(url, '_blank');
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen text-brand-brown">Loading studio...</div>;

    return (
        <div className="flex flex-col md:flex-row md:h-[calc(100vh-64px)] min-h-[calc(100vh-64px)] bg-brand-cream relative overflow-x-hidden">
            {/* Modal */}
            {selectedMockupForView && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setSelectedMockupForView(null)}
                >
                    <div
                        className="relative max-w-4xl max-h-[90vh] bg-transparent flex flex-col items-center"
                        onClick={e => e.stopPropagation()}
                    >
                        <img
                            src={selectedMockupForView.url}
                            alt={selectedMockupForView.category}
                            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl mb-4"
                        />
                        <div className="flex gap-4">
                            <Button
                                variant="secondary"
                                onClick={() => handleDownload(selectedMockupForView.url, `situ-${selectedMockupForView.category}-${Date.now()}.png`)}
                            >
                                Download High-Res
                            </Button>
                            <Button
                                variant="outline"
                                className="bg-white/10 text-white hover:bg-white/20 border-white/20"
                                onClick={() => setSelectedMockupForView(null)}
                            >
                                Close
                            </Button>
                        </div>
                        <button
                            className="absolute -top-10 right-0 text-white/80 hover:text-white text-3xl"
                            onClick={() => setSelectedMockupForView(null)}
                        >
                            &times;
                        </button>
                    </div>
                </div>
            )}

            {/* Low Credits Popup for Free Users */}
            {showLowCreditsPopup && userPlan === "free" && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => setShowLowCreditsPopup(false)}
                >
                    <div
                        className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center text-3xl">
                                ⚠️
                            </div>
                            <h2 className="text-xl font-bold text-brand-brown mb-2">Credits Running Low</h2>
                            <p className="text-brand-brown/70 mb-6">
                                You have <span className="font-bold text-amber-600">{credits}</span> credits remaining.
                                Want 12 more free credits? Fill out our quick feedback form!
                            </p>
                            <div className="space-y-3">
                                <a
                                    href="https://docs.google.com/forms/d/e/1FAIpQLSc3UMMIEpwxO05bsf_LFfHyTCz9pAO-tGV_BbNmOWaE79_bAg/viewform?usp=publish-editor"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                >
                                    <Button className="w-full">
                                        Get 12 Free Credits
                                    </Button>
                                </a>
                                <Button
                                    variant="ghost"
                                    className="w-full text-brand-brown/50"
                                    onClick={() => setShowLowCreditsPopup(false)}
                                >
                                    Maybe Later
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Left Sidebar: Artwork Gallery */}
            {/* Desktop: Order 1 (default). Mobile: Order 1. */}
            <div className="w-full md:w-64 bg-white/50 border-r border-brand-brown/10 p-4 flex flex-col flex-shrink-0 h-auto md:h-full order-1">
                <h3 className="font-semibold text-sm text-brand-brown/50 mb-3 uppercase tracking-wider">Your Artwork</h3>

                {/* Mobile: Horizontal scroll or grid? Grid for now as per requirements. */}
                <div className="flex-1 md:overflow-y-auto space-y-3">
                    <label className="block">
                        <div className="border-2 border-dashed border-brand-brown/20 rounded-lg p-4 text-center hover:bg-brand-sand/30 hover:border-brand-brown/30 cursor-pointer transition-all group">
                            <span className="text-2xl text-brand-brown/40 group-hover:text-brand-brown/60 block mb-1">+</span>
                            <p className="text-xs font-medium text-brand-brown/50 group-hover:text-brand-brown/70">
                                {uploading ? "Uploading..." : "Upload New"}
                            </p>
                            <input
                                type="file"
                                className="hidden"
                                onChange={handleUpload}
                                disabled={uploading}
                                accept="image/*"
                            />
                        </div>
                    </label>

                    <div className="grid grid-cols-4 md:grid-cols-2 gap-2">
                        {artworks.map(art => (
                            <div
                                key={art.id}
                                className={`aspect-square rounded-md overflow-hidden border-2 cursor-pointer transition-all ${selectedArtwork === art.id
                                    ? 'border-brand-brown ring-1 ring-brand-brown'
                                    : 'border-transparent hover:border-brand-brown/20'
                                    }`}
                                onClick={() => setSelectedArtwork(art.id)}
                            >
                                <img src={art.url} alt={art.name} className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Center: Mockups Grid */}
            {/* Desktop: Order 2. Mobile: Order 3 (Bottom). */}
            <div className="flex-1 flex flex-col min-w-0 bg-brand-cream order-3 md:order-2 min-h-[500px] md:min-h-0">
                <div className="h-16 border-b border-brand-brown/10 bg-white/50 px-8 flex items-center justify-between flex-shrink-0">
                    <h1 className="text-xl font-bold text-brand-brown font-serif">Member Studio</h1>
                </div>

                <div className="flex-1 md:overflow-y-auto p-4 md:p-8">
                    {mockups.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 min-h-[300px]">
                            <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center text-2xl">🎨</div>
                            <p className="text-lg font-medium text-slate-600">No mockups yet</p>
                            <p className="text-sm mt-1">Select an artwork and create your first mockup.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {mockups.map(mockup => (
                                <div
                                    key={mockup.id}
                                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col cursor-pointer"
                                    onClick={() => setSelectedMockupForView(mockup)}
                                >
                                    <div
                                        className="relative bg-slate-100 w-full"
                                        style={{ aspectRatio: mockup.aspectRatio ? mockup.aspectRatio.replace(':', '/') : '1/1' }}
                                    >
                                        <img src={mockup.url} alt={mockup.category} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="w-full max-w-[120px]"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedMockupForView(mockup);
                                                }}
                                            >
                                                Preview
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="w-full max-w-[120px]"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownload(mockup.url, `situ-${mockup.category}-${Date.now()}.png`);
                                                }}
                                            >
                                                Download
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-medium bg-brand-sand/20 px-2 py-1 rounded-full capitalize text-brand-brown">
                                                {mockup.category}
                                            </span>
                                            <span className="text-xs text-brand-brown/40">
                                                {mockup.createdAt?.toDate ? mockup.createdAt.toDate().toLocaleDateString() : 'Just now'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Sidebar: Controls */}
            {/* Desktop: Order 3. Mobile: Order 2 (Middle). */}
            <div className="w-full md:w-80 bg-white/50 border-l border-brand-brown/10 p-6 flex flex-col flex-shrink-0 md:overflow-y-auto h-auto md:h-full order-2 md:order-3 border-t md:border-t-0 md:border-l">
                <div className="mb-4 md:mb-8">
                    <h2 className="text-lg font-bold text-brand-brown mb-1 font-serif">Create</h2>
                    <p className="text-sm text-brand-brown/70">Create new mockups from your art.</p>
                </div>

                <div className="space-y-6 flex-1">
                    {/* Product Selection */}
                    <div>
                        <label className="text-xs font-semibold text-brand-brown/50 uppercase tracking-wider mb-2 block">Product</label>
                        <select
                            value={selectedProduct}
                            onChange={(e) => setSelectedProduct(e.target.value)}
                            className="w-full text-sm border border-brand-brown/20 rounded-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-brown bg-transparent text-brand-brown"
                        >
                            <option value="wall">Wall Art</option>
                            <option value="prints">Art Prints</option>
                            <option value="wearable">Apparel / Wearable</option>
                            <option value="phone">Phone Case</option>
                            <option value="mug">Mug</option>
                            <option value="tote">Tote Bag</option>
                            <option value="pillow">Throw Pillow</option>
                            <option value="notebook">Notebook</option>
                            <option value="patch">Embroidered Patch</option>
                        </select>
                    </div>

                    {/* Variations */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-semibold text-brand-brown/50 uppercase tracking-wider">Variations</label>
                            <span className="text-xs font-medium text-brand-brown">{numVariations}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="4"
                            value={numVariations}
                            onChange={(e) => setNumVariations(parseInt(e.target.value))}
                            className="w-full accent-brand-olive"
                        />
                        <p className="text-xs text-brand-brown/40 mt-1">Create multiple versions at once.</p>
                    </div>

                    {/* Aspect Ratio */}
                    <div>
                        <label className="text-xs font-semibold text-brand-brown/50 uppercase tracking-wider mb-2 block">Aspect Ratio</label>
                        <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="w-full text-sm border border-brand-brown/20 rounded-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-brown bg-transparent text-brand-brown"
                        >
                            <option value="1:1">1:1 (Square)</option>
                            <option value="16:9">16:9 (Landscape)</option>
                            <option value="9:16">9:16 (Portrait)</option>
                            <option value="4:3">4:3 (Standard)</option>
                            <option value="3:4">3:4 (Vertical)</option>
                        </select>
                    </div>

                    {/* Custom Prompt */}
                    <div>
                        <label className="text-xs font-semibold text-brand-brown/50 uppercase tracking-wider mb-2 block">Additional Details</label>
                        <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Describe the scene, lighting, or style (e.g., 'modern living room with plants', 'neon lighting')"
                            className="w-full text-sm border border-brand-brown/20 rounded-xl px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-brand-brown bg-transparent text-brand-brown placeholder:text-brand-brown/30"
                        />
                    </div>
                </div>

                {/* Footer: Credits & Action */}
                <div className="mt-8 pt-6 border-t border-brand-brown/10">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-medium text-brand-brown/70">Available Credits</span>
                        <span className="text-lg font-bold text-brand-brown">{credits}</span>
                    </div>
                    {profileStatus === "ensuring" && (
                        <div className="text-center py-20 bg-white/50 rounded-3xl border border-brand-brown/10 mb-8">
                            <div className="w-16 h-16 bg-brand-sand text-brand-brown rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-brand-brown mb-2 font-serif">We're setting up your account</h2>
                            <p className="text-brand-brown/70 max-w-sm mx-auto">
                                This usually takes just a few seconds. If it takes longer, please try refreshing the page.
                            </p>
                            {profileError && (
                                <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-lg max-w-md mx-auto text-sm border border-red-100">
                                    {profileError}
                                    <button onClick={retryEnsureProfile} className="block w-full mt-2 font-bold underline">
                                        Try again
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <Button
                        onClick={handleGenerate}
                        disabled={generating || !selectedArtwork || credits < numVariations}
                        className="w-full"
                    >
                        {generating ? (
                            <>
                                <span className="animate-spin mr-2">⟳</span> Generating...
                            </>
                        ) : (
                            `Create (${numVariations} credit${numVariations > 1 ? 's' : ''})`
                        )}
                    </Button>

                    <Button
                        onClick={handleTopUp}
                        disabled={topUpLoading}
                        variant="outline"
                        className="w-full mt-3 border-brand-brown text-brand-brown hover:bg-brand-sand/60"
                    >
                        {topUpLoading ? "Loading..." : "Buy 50 credits - $12"}
                    </Button>

                    {credits < numVariations && (
                        <p className="text-xs text-red-500 text-center mt-2">Not enough credits</p>
                    )}


                </div>
            </div>
        </div>
    );
}
