export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

export type SessionPayload = {
  id: number;
  unionId: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: "user" | "admin";
};

export type UserProfile = {
  unionId: string;
  nickname?: string;
  avatar?: string;
  email?: string;
};
