import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db, storage } from "../lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, serverTimestamp, orderBy, updateDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";

export function MemberStudio() {
    const { user } = useAuth();
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

    // Auth & Data Subscription
    useEffect(() => {
        if (!user) {
            navigate("/login");
            return;
        }

        setLoading(false);

        // Subscribe to user profile for credits
        const unsubUser = onSnapshot(doc(db, "users", user.uid), async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCredits(data.credits || 0);

                // TEMPORARY: Auto-refill credits for testing if low
                if ((data.credits || 0) < 5) {
                    updateDoc(doc(db, "users", user.uid), { credits: 20 })
                        .catch(err => console.error("Failed to refill credits", err));
                }
            } else {
                // Profile missing (e.g. signup timeout). Create it now.
                console.log("User profile missing, creating default...");
                try {
                    await setDoc(doc(db, "users", user.uid), {
                        email: user.email,
                        displayName: user.displayName,
                        createdAt: serverTimestamp(),
                        plan: "free",
                        credits: 20
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
            const arts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setArtworks(arts);
            if (arts.length > 0 && !selectedArtwork) {
                setSelectedArtwork(arts[0].id);
            }
        });

        // Subscribe to mockups
        const qMockups = query(
            collection(db, "users", user.uid, "mockups"),
            orderBy("createdAt", "desc")
        );
        const unsubMockups = onSnapshot(qMockups, (snapshot) => {
            setMockups(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubUser();
            unsubArtworks();
            unsubMockups();
        };
    }, [user, navigate, selectedArtwork]);

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

            // Manually update state to show results immediately (especially if DB save failed)
            if (data.results && data.results.length > 0) {
                const newMockups = data.results.map((r: any) => ({
                    id: r.id || `temp_${Date.now()}`,
                    url: r.url,
                    category: r.category,
                    createdAt: { toDate: () => new Date() } // Mock Firestore timestamp
                }));
                setMockups(prev => [...newMockups, ...prev]);
            }

            if (data.errors && data.errors.length > 0) {
                console.warn("Some variations failed:", data.errors);
                const errorMessages = data.errors.map((e: any) => `${e.category}: ${e.message}`).join("\n");
                alert(`Generated ${data.results.length} images, but some failed:\n${errorMessages}`);
            }
        } catch (error: any) {
            console.error("Generate error:", error);
            alert(`Generation failed: ${error.message}`);
        } finally {
            setGenerating(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen">Loading studio...</div>;

    return (
        <div className="flex h-[calc(100vh-64px)] bg-slate-50">
            {/* Left Sidebar: Artwork Gallery */}
            <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col flex-shrink-0">
                <h3 className="font-semibold text-sm text-slate-500 mb-3 uppercase tracking-wider">Your Artwork</h3>

                <div className="flex-1 overflow-y-auto space-y-3">
                    <label className="block">
                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-all group">
                            <span className="text-2xl text-slate-400 group-hover:text-slate-500 block mb-1">+</span>
                            <p className="text-xs font-medium text-slate-500 group-hover:text-slate-600">
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
                                    ? 'border-slate-900 ring-1 ring-slate-900'
                                    : 'border-transparent hover:border-slate-200'
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
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
                <div className="h-16 border-b border-slate-200 bg-white px-8 flex items-center justify-between flex-shrink-0">
                    <h1 className="text-xl font-bold text-slate-900">Member Studio</h1>
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
                                <div key={mockup.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col">
                                    <div className="aspect-[4/5] relative bg-slate-100">
                                        <img src={mockup.url} alt={mockup.category} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => window.open(mockup.url, '_blank')}
                                            >
                                                Download
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-medium bg-slate-100 px-2 py-1 rounded-full capitalize">
                                                {mockup.category}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {mockup.createdAt?.toDate().toLocaleDateString()}
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
            <div className="w-80 bg-white border-l border-slate-200 p-6 flex flex-col flex-shrink-0 overflow-y-auto">
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-slate-900 mb-1">Generate</h2>
                    <p className="text-sm text-slate-500">Create new mockups from your art.</p>
                </div>

                <div className="space-y-6 flex-1">
                    {/* Product Selection */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Product</label>
                        <select
                            value={selectedProduct}
                            onChange={(e) => setSelectedProduct(e.target.value)}
                            className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        >
                            <option value="wall">Wall Art</option>
                            <option value="prints">Art Prints</option>
                            <option value="wearable">Apparel / Wearable</option>
                            <option value="phone">Phone Case</option>
                            <option value="mug">Mug</option>
                            <option value="tote">Tote Bag</option>
                            <option value="pillow">Throw Pillow</option>
                            <option value="notebook">Notebook</option>
                        </select>
                    </div>

                    {/* Variations */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Variations</label>
                            <span className="text-xs font-medium text-slate-900">{numVariations}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="4"
                            value={numVariations}
                            onChange={(e) => setNumVariations(parseInt(e.target.value))}
                            className="w-full accent-slate-900"
                        />
                        <p className="text-xs text-slate-400 mt-1">Generate multiple versions at once.</p>
                    </div>

                    {/* Aspect Ratio */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Aspect Ratio</label>
                        <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Additional Details</label>
                        <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Describe the scene, lighting, or style (e.g., 'modern living room with plants', 'neon lighting')"
                            className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                    </div>
                </div>

                {/* Footer: Credits & Action */}
                <div className="mt-8 pt-6 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-medium text-slate-600">Available Credits</span>
                        <span className="text-lg font-bold text-slate-900">{credits}</span>
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
