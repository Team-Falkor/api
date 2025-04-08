import { t } from "elysia";

const loginBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8 }),
});

const signupBodySchema = t.Object({
  username: t.String({ maxLength: 60, minLength: 1 }),
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8 }),
});

export { loginBodySchema, signupBodySchema };
