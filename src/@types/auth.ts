import { JWTPayloadSpec } from "@elysiajs/jwt";
import { User } from "@prisma/client";
import { Context } from "elysia";

export type AuthContext = Context<{
  body: {
    email: string;
    password: string;
  };
}> & {
  jwt: {
    sign: (payload: JWTPayloadSpec) => Promise<string>;
    verify: (jwt?: string) => Promise<JWTPayloadSpec | false>;
  };
  user?: User;
};

export type RefreshContext = Context<{
  body: {};
}> & {
  jwt: {
    sign: (payload: JWTPayloadSpec) => Promise<string>;
    verify: (jwt?: string) => Promise<JWTPayloadSpec | false>;
  };
};

export type RegisterContext = Context<{
  body: {
    username: string;
    email: string;
    password: string;
  };
}>;

export type LogoutContext = Context & {
  user: User;
};
