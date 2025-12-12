export type MockupCategory = "wall" | "prints" | "wearable" | "phone";

export interface GuestMockupRequest {
    artworkUrl: string;
    categories: MockupCategory[];
}

export interface GuestMockupResult {
    category: MockupCategory;
    url: string | null;
}

export interface GuestMockupResponse {
    ok: boolean;
    sessionId?: string;
    results: GuestMockupResult[];
    errors: { category: MockupCategory; message: string }[];
}

export interface SendGuestMockupsRequest {
    email: string;
    sessionId: string;
}

export interface MemberMockupRequest {
    artworkId: string;
    products: MockupCategory[];
    aspectRatio: string;
    resolution: number;
}

export interface EditMockupRequest {
    mockupId: string;
    editPrompt: string;
}

export interface UserProfile {
    email: string;
    createdAt: any; // Firestore Timestamp
    plan: "free" | "monthly" | "3month" | "6month";
    credits: number;
    stripeCustomerId?: string;
    promo?: string;
    displayName?: string;
}

export interface Artwork {
    id: string;
    url: string;
    name: string;
    createdAt: any;
}

export interface Mockup {
    id: string;
    url: string;
    category: string;
    createdAt: any;
    artworkId: string;
    aspectRatio?: string;
    customPrompt?: string;
}
