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
    results: GuestMockupResult[];
    errors: { category: MockupCategory; message: string }[];
}

export interface SendGuestMockupsRequest {
    email: string;
    mockupUrls: string[];
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
