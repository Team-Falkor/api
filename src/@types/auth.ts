// src/@types/auth.ts

import { JWTPayloadSpec } from "@elysiajs/jwt";
import { User } from "@prisma/client";
import type { Context } from "elysia";

export interface JWTHelpers {
  sign(payload: JWTPayloadSpec): Promise<string>;
  verify(token?: string): Promise<JWTPayloadSpec | false>;
}

export interface CookieAPI {
  set(opts: {
    value: string;
    maxAge: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "strict" | "none";
    path: string;
  }): void;
  remove(): void;
  value?: string;
}

export type AuthContext = Context<{
  body: { email: string; password: string };
}> & {
  jwt: JWTHelpers;
  cookie: {
    accessToken: CookieAPI;
    refreshToken: CookieAPI;
  };
  set: { status(code: number): void };
  error(status: number, body: unknown): never;
};

export type RefreshContext = Context<{ body: {} }> & {
  jwt: JWTHelpers;
  cookie: { accessToken: CookieAPI; refreshToken: CookieAPI };
  set: { status(code: number): void };
  error(status: number, body: unknown): never;
};

export type RegisterContext = Context<{
  body: { username: string; email: string; password: string };
}> & {
  set: { status(code: number): void };
};

export type LogoutContext = Context & {
  user: User;
  cookie: { accessToken: CookieAPI; refreshToken: CookieAPI };
  set: { status(code: number): void };
};
