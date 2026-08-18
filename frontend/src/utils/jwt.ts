// Minimal JWT payload decoder (no signature verification on the client).
export interface JwtClaims {
    user_id: number;
    username: string;
    roles: string[];
    warehouses: string[];
    sub?: string;
    exp?: number;
    [key: string]: unknown;
}

export function decodeJwtPayload<T = JwtClaims>(token: string): T | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const json = decodeURIComponent(
            atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join(""),
        );
        return JSON.parse(json) as T;
    } catch {
        return null;
    }
}
