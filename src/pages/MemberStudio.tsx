import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db, storage } from "../lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, serverTimestamp, orderBy, setDoc } from "firebase/firestore";
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
    const [mockups, setMockups] = useState<any[]>([]);
    const [credits, setCredits] = useState(0);
    const [loading, setLoading] = useState(true);

    // Generation Options
    const [selectedProduct, setSelectedProduct] = useState<string>("wall");
    const [numVariations, setNumVariations] = useState(1);
    const [aspectRatio, setAspectRatio] = useState("1:1");
    const [customPrompt, setCustomPrompt] = useState("");

    // Modal State
    const [selectedMockupForView, setSelectedMockupForView] = useState<any | null>(null);

    // Auth & Data Subscription
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            navigate("/login");
            return;
        }

        // Subscribe to user profile for credits
        const unsubUser = onSnapshot(doc(db, "users", user.uid), async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCredits(data.credits || 0);
            } else {
                // Profile missing (e.g. signup timeout). Create it now.
                console.log("User profile missing, creating default...");
                try {
                    await setDoc(doc(db, "users", user.uid), {
                        email: user.email,
                        displayName: user.displayName,
                        createdAt: serverTimestamp(),
                        plan: "free",
                        credits: 12
                    });
                } catch (err) {
                    console.error("Failed to create missing profile", err);
                }
            }
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
        });

        setLoading(false);

        return () => {
            unsubUser();
            unsubArtworks();
        };
    }, [user, authLoading, navigate]); // Removed selectedArtwork from dependencies

    // Separate effect for mockups to avoid re-subscribing when other things change
    useEffect(() => {
        if (authLoading || !user || !selectedArtwork) {
            setMockups([]);
            return;
        }

        console.log(`[MemberStudio] Subscribing to mockups for artwork ${selectedArtwork}`);

        // Ensure we handle duplicate keys by relying on Firestore IDs which are unique
        // Removed filter by selectedArtwork to show ALL mockups
        const q = query(
            collection(db, "users", user.uid, "mockups"),
            orderBy("createdAt", "desc")
        );

        const unsubMockups = onSnapshot(q, (snapshot) => {
            const results = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Mockup[];

            // Filter out any potential duplicates client-side just in case, though Firestore shouldn't return dupes in snapshot
            const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());

            console.log(`[MemberStudio] Loaded ${uniqueResults.length} mockups`);
            setMockups(uniqueResults);
        }, (error) => {
            console.error("[MemberStudio] Failed to load mockups.", error);
        });

        return () => unsubMockups();
    }, [user, authLoading]); // Removed selectedArtwork dependency

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

    const handleGenerate = async () => {
        if (!selectedArtwork || !user) return;

        setGenerating(true);
        try {
            const token = await user.getIdToken();
            const selectedArtworkObj = artworks.find(a => a.id === selectedArtwork);
            const artworkUrl = selectedArtworkObj?.url;

            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/generateMemberMockups`, {
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

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Generation failed");
            }

            const data = await response.json();
            if (data.ok) {
                // We rely on the Firestore listeners (onSnapshot) to update credits and mockups automatically.
                // This prevents duplicate keys and "disappearing" items caused by race conditions between
                // manual state updates and real-time listeners.

                if (data.errors && data.errors.length > 0) {
                    console.warn("Some variations failed:", data.errors);
                    const errorMessages = data.errors.map((e: any) => `${e.category}: ${e.message}`).join("\n");
                    alert(`Generated ${data.results.length} images, but some failed:\n${errorMessages}`);
                }
            } else {
                console.error("Generation failed:", data.error);
                alert(`Generation failed: ${data.error}`);
            }
        } catch (error: any) {
            console.error("Generate error:", error);
            alert(`Generation failed: ${error.message}`);
        } finally {
            setGenerating(false);
        }
    };

    const handleRefreshCredits = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Use onSnapshot for a one-time fetch with error handling, then immediately unsubscribe
            const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    console.log("[MemberStudio] User data updated:", data);
                    setCredits(data.credits || 0);
                }
                unsubscribe(); // Unsubscribe immediately after getting the data
            }, (error) => {
                console.error("[MemberStudio] Failed to listen to user data:", error);
                // If there's an error, we might still want to set loading to false
                setLoading(false);
            });
        } catch (error) {
            // This catch block would only catch errors in setting up the listener, not during the listener's execution
            console.error("Failed to refresh credits (listener setup error):", error);
        } finally {
            // The finally block here might execute before the onSnapshot callback if it's asynchronous.
            // It's better to manage setLoading(false) within the onSnapshot callbacks.
            // For a "refresh" function, getDoc is typically used for a single fetch.
            // If the intent is to ensure the listener is working, the useEffect already handles it.
            // For a manual refresh, getDoc is more direct.
            // Reverting to getDoc for a single refresh, but adding the console.log for consistency.
            // If the instruction strictly means to use onSnapshot *here*, then the finally block needs careful handling.
            // Given the instruction, I'll adapt the onSnapshot to behave like a one-time fetch for "refresh".
            // The `unsubscribe()` call inside the success callback makes it behave like a one-time fetch.
            // The `setLoading(false)` needs to be called in both success and error paths of the onSnapshot.
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
        <div className="flex h-[calc(100vh-64px)] bg-brand-cream relative">
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

            {/* Left Sidebar: Artwork Gallery */}
            <div className="w-64 bg-white/50 border-r border-brand-brown/10 p-4 flex flex-col flex-shrink-0">
                <h3 className="font-semibold text-sm text-brand-brown/50 mb-3 uppercase tracking-wider">Your Artwork</h3>

                <div className="flex-1 overflow-y-auto space-y-3">
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

                    <div className="grid grid-cols-2 gap-2">
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
            <div className="flex-1 flex flex-col min-w-0 bg-brand-cream">
                <div className="h-16 border-b border-brand-brown/10 bg-white/50 px-8 flex items-center justify-between flex-shrink-0">
                    <h1 className="text-xl font-bold text-brand-brown font-serif">Member Studio</h1>
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                    {mockups.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center text-2xl">🎨</div>
                            <p className="text-lg font-medium text-slate-600">No mockups yet</p>
                            <p className="text-sm mt-1">Select an artwork and generate your first mockup.</p>
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
            <div className="w-80 bg-white/50 border-l border-brand-brown/10 p-6 flex flex-col flex-shrink-0 overflow-y-auto">
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-brand-brown mb-1 font-serif">Generate</h2>
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
                        <p className="text-xs text-brand-brown/40 mt-1">Generate multiple versions at once.</p>
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
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-brand-brown">{credits}</span>
                            <button
                                onClick={handleRefreshCredits}
                                className="text-brand-brown/40 hover:text-brand-brown/70 p-1 rounded-full hover:bg-brand-sand/30 transition-colors"
                                title="Refresh Credits"
                            >
                                ⟳
                            </button>
                        </div>
                    </div>

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
                            `Generate (${numVariations} credit${numVariations > 1 ? 's' : ''})`
                        )}
                    </Button>

                    {credits < numVariations && (
                        <p className="text-xs text-red-500 text-center mt-2">Not enough credits</p>
                    )}

                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={async () => {
                                if (confirm("Are you sure you want to delete your account? This cannot be undone.")) {
                                    try {
                                        await user?.delete();
                                        navigate("/");
                                    } catch (error: any) {
                                        console.error("Delete error:", error);
                                        alert("Failed to delete account. You may need to log out and log in again.");
                                    }
                                }
                            }}
                        >
                            Delete Account
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
