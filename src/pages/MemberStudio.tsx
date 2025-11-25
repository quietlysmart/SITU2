import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db, storage } from "../lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "../components/ui/button";

export function MemberStudio() {
    const { user } = useAuth();
    const [artworks, setArtworks] = useState<any[]>([]);
    const [selectedArtwork, setSelectedArtwork] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [mockups, setMockups] = useState<any[]>([]);
    const [credits, setCredits] = useState(0);

    useEffect(() => {
        if (!user) return;

        // Subscribe to user profile for credits
        const unsubUser = onSnapshot(doc(db, "users", user.uid), (doc) => {
            if (doc.exists()) {
                setCredits(doc.data().credits || 0);
            }
        });

        // Subscribe to artworks
        const q = query(collection(db, "users", user.uid, "artworks"));
        const unsubArtworks = onSnapshot(q, (snapshot) => {
            const arts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setArtworks(arts);
            if (arts.length > 0 && !selectedArtwork) {
                setSelectedArtwork(arts[0].id);
            }
        });

        // Subscribe to mockups
        const qMockups = query(collection(db, "users", user.uid, "mockups"));
        const unsubMockups = onSnapshot(qMockups, (snapshot) => {
            setMockups(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubUser();
            unsubArtworks();
            unsubMockups();
        };
    }, [user]);

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
        } catch (error) {
            console.error("Upload error:", error);
        } finally {
            setUploading(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedArtwork || !user) return;
        setGenerating(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/generateMemberMockups`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    artworkId: selectedArtwork,
                    products: ["wall", "prints", "wearable", "phone"],
                    aspectRatio: "1:1",
                    resolution: 1024,
                }),
            });

            if (!response.ok) {
                throw new Error("Generation failed");
            }
        } catch (error) {
            console.error("Generate error:", error);
        } finally {
            setGenerating(false);
        }
    };

    const handleEdit = async (mockupId: string, prompt: string) => {
        if (!user || !prompt) return;
        try {
            const token = await user.getIdToken();
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/editMockup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    mockupId,
                    editPrompt: prompt,
                }),
            });

            if (!response.ok) {
                throw new Error("Edit failed");
            }
        } catch (error) {
            console.error("Edit error:", error);
        }
    };

    return (
        <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row gap-8 h-[calc(100vh-64px)]">
            {/* Sidebar */}
            <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-6 border-r border-slate-200 pr-6">
                <div>
                    <h2 className="font-bold text-lg mb-4">Credits: {credits}</h2>
                    <Button className="w-full" onClick={() => window.location.href = '/pricing'}>Get more credits</Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <h3 className="font-semibold mb-2">Your Artworks</h3>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {artworks.map(art => (
                            <div
                                key={art.id}
                                className={`aspect-square rounded-md overflow-hidden border-2 cursor-pointer ${selectedArtwork === art.id ? 'border-slate-900' : 'border-transparent'}`}
                                onClick={() => setSelectedArtwork(art.id)}
                            >
                                <img src={art.url} alt={art.name} className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                    <label className="block">
                        <span className="sr-only">Upload artwork</span>
                        <div className="border-2 border-dashed border-slate-300 rounded-md p-4 text-center cursor-pointer hover:border-slate-400 transition-colors">
                            <span className="text-sm text-slate-600">{uploading ? "Uploading..." : "+ Upload New"}</span>
                            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept="image/*" />
                        </div>
                    </label>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Studio</h1>
                    <Button onClick={handleGenerate} disabled={generating || !selectedArtwork || credits < 4}>
                        {generating ? "Generating..." : "Generate All (4 credits)"}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {mockups.map(mockup => (
                        <div key={mockup.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm group flex flex-col">
                            <div className="aspect-[4/5] relative bg-slate-100">
                                <img src={mockup.url} alt={mockup.category} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => window.open(mockup.url, '_blank')}>Download</Button>
                                </div>
                            </div>
                            <div className="p-4 flex-1 flex flex-col gap-3">
                                <p className="text-sm font-medium capitalize text-slate-900">{mockup.category}</p>
                                <div className="mt-auto">
                                    <label className="text-xs text-slate-500 mb-1 block">Not quite right?</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Describe changes..."
                                            className="flex-1 text-sm border border-slate-300 rounded px-2 py-1"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleEdit(mockup.id, e.currentTarget.value);
                                                    e.currentTarget.value = '';
                                                }
                                            }}
                                        />
                                        <Button size="sm" variant="outline" className="h-8 px-2" onClick={(e) => {
                                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                            handleEdit(mockup.id, input.value);
                                            input.value = '';
                                        }}>
                                            Regenerate
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {mockups.length === 0 && (
                        <div className="col-span-full text-center py-20 text-slate-500">
                            Select an artwork and click Generate to create mockups.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
