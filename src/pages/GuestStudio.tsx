import { useState } from "react";
import { Button } from "../components/ui/button";
import type { GuestMockupResponse, MockupCategory } from "../types";

// Simple spinner component
function Spinner() {
    return (
        <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );
}

export function GuestStudio() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [results, setResults] = useState<GuestMockupResponse | null>(null);
    const [email, setEmail] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    // Debug: Log all clicks to see what is being clicked
    // useEffect(() => {
    //     const handler = (e: MouseEvent) => console.log('Global click detected on:', e.target);
    //     window.addEventListener('click', handler);
    //     return () => window.removeEventListener('click', handler);
    // }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            const reader = new FileReader();
            reader.onload = (event) => {
                setPreviewUrl(event.target?.result as string);
            };
            reader.readAsDataURL(selectedFile);
        }
    };

    const handleGenerate = async () => {
        console.log("handleGenerate called");
        if (!previewUrl) {
            console.warn("No previewUrl, aborting generation");
            return;
        }

        setIsGenerating(true);
        console.log("Starting generation with previewUrl length:", previewUrl.length);
        try {
            const apiUrl = `${import.meta.env.VITE_API_BASE_URL}/generateGuestMockups`;
            console.log("Fetching from:", apiUrl);

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    artworkUrl: previewUrl,
                    categories: ["wall", "prints", "wearable", "phone"],
                }),
            });
            console.log("Response status:", response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("API Error:", response.status, errorText);
                throw new Error(`API Error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            console.log("Generation data received:", data);
            setResults(data);
        } catch (error) {
            console.error("Error generating mockups:", error);
            // Handle error state
        } finally {
            setIsGenerating(false);
            console.log("Generation finished");
        }
    };

    const handleSendEmail = async () => {
        if (!email || !results?.results) return;

        setIsSending(true);
        try {
            const mockupUrls = results.results.map(r => r.url).filter(u => u !== null) as string[];
            await fetch(`${import.meta.env.VITE_API_BASE_URL}/sendGuestMockups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, mockupUrls }),
            });
            setEmailSent(true);
        } catch (error) {
            console.error("Error sending email:", error);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <div className="text-center mb-12">
                <h1 className="text-3xl font-bold text-slate-900 mb-4">Guest Studio</h1>
                <p className="text-slate-600">Upload your artwork to see it on real products.</p>
            </div>

            {!results ? (
                <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl border-2 border-dashed border-slate-300 text-center hover:border-slate-400 transition-colors">
                    <div className="space-y-6">
                        {previewUrl ? (
                            <div className="relative aspect-square w-48 mx-auto overflow-hidden rounded-lg border border-slate-200">
                                <img src={previewUrl} alt="Preview" className="object-cover w-full h-full" />
                                <button
                                    onClick={() => { setFile(null); setPreviewUrl(null); }}
                                    className="absolute top-2 right-2 bg-white/80 p-1 rounded-full hover:bg-white text-slate-600"
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        )}

                        <div>
                            <label htmlFor="file-upload" className="cursor-pointer">
                                <span className="bg-slate-900 text-white px-6 py-3 rounded-md font-medium hover:bg-slate-800 transition-colors inline-block">
                                    {previewUrl ? "Change Artwork" : "Select Artwork"}
                                </span>
                                <input
                                    id="file-upload"
                                    type="file"
                                    className="hidden"
                                    accept="image/png, image/jpeg"
                                    onChange={handleFileChange}
                                />
                            </label>
                            <p className="text-sm text-slate-500 mt-4">JPG or PNG, up to 5MB</p>
                        </div>

                        {previewUrl && (
                            <div className="pt-4 border-t border-slate-100">
                                <Button onClick={handleGenerate} disabled={isGenerating} size="lg" className="w-full">
                                    {isGenerating ? (
                                        <>
                                            <Spinner />
                                            <span className="ml-2">Generating Mockups...</span>
                                        </>
                                    ) : (
                                        "Generate Mockups"
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-12">
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {results.results.map((result, idx) => (
                            <div key={idx} className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
                                <div className="aspect-[4/5] bg-slate-100 relative">
                                    {result.url ? (
                                        <img src={result.url} alt={result.category} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-red-500 text-sm p-4 text-center">
                                            Failed to generate
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                                        <span className="text-white font-medium capitalize">{result.category}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {results.errors && results.errors.map((error, idx) => (
                            <div key={`error-${idx}`} className="bg-red-50 rounded-xl overflow-hidden shadow-sm border border-red-200 p-4 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                                <div className="text-red-500 font-bold mb-2 capitalize">{error.category}</div>
                                <div className="text-red-600 text-sm">{error.message}</div>
                            </div>
                        ))}
                    </div>

                    <div className="max-w-md mx-auto bg-slate-50 p-8 rounded-2xl text-center">
                        {!emailSent ? (
                            <>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Keep your mockups</h3>
                                <p className="text-slate-600 mb-6">Enter your email to receive these 4 high-res mockups instantly.</p>
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        placeholder="you@example.com"
                                        className="flex-1 px-4 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                    <Button onClick={handleSendEmail} disabled={isSending}>
                                        {isSending ? <Spinner /> : "Send"}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="text-green-600">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold mb-2">Sent!</h3>
                                <p className="text-slate-600 mb-4">Check your inbox for your mockups.</p>
                                <Button variant="outline" onClick={() => window.location.href = '/signup?promo=early-tester-20'}>
                                    Create account & get 20 free credits
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="text-center">
                        <Button variant="ghost" onClick={() => { setResults(null); setPreviewUrl(null); setFile(null); setEmailSent(false); }}>
                            Start over
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
