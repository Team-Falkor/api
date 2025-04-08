import {
  AuthContext,
  LogoutContext,
  RefreshContext,
  RegisterContext,
} from "../@types";
import { ACCESS_TOKEN_EXP, REFRESH_TOKEN_EXP } from "../utils/constants";
import { prisma } from "../utils/prisma";
import { createResponse } from "../utils/response";
import { getExpTimestamp } from "../utils/utils";

export async function login({
  body,
  jwt,
  cookie: { accessToken, refreshToken },
  set,
  error,
}: AuthContext) {
  // Find the user by email
  const user = await prisma.user.findUnique({
    where: { email: body.email },
    select: {
      id: true,
      email: true,
      password: true,
    },
  });

  if (!user) {
    set.status = "Bad Request";
    return error(
      404,
      createResponse({
        message: "The email address or password you entered is incorrect",
        success: false,
        error: true,
      })
    );
  }

  // Verify password using Bun.password.verify
  const matchPassword = await Bun.password.verify(
    body.password,
    user.password,
    "bcrypt"
  );
  if (!matchPassword) {
    set.status = "Bad Request";
    return error(
      404,
      createResponse({
        message: "The email address or password you entered is incorrect",
        success: false,
        error: true,
      })
    );
  }

  // Create access token
  const accessJWTToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(ACCESS_TOKEN_EXP),
  });
  accessToken.set({
    value: accessJWTToken,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_EXP,
    path: "/",
  });

  // Create refresh token
  const refreshJWTToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(REFRESH_TOKEN_EXP),
  });
  refreshToken.set({
    value: refreshJWTToken,
    httpOnly: true,
    maxAge: REFRESH_TOKEN_EXP,
    path: "/",
  });

  // Update user online status and store the refresh token in the database
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      isOnline: true,
      refreshToken: refreshJWTToken,
      lastLogin: new Date(),
    },
    omit: {
      password: true,
      refreshToken: true,
      verificationToken: true,
      resetTokenExpiry: true,
      resetToken: true,
    },
  });

  return createResponse({
    success: true,
    message: "Sign-in successfully",
    data: {
      user: updatedUser,
      accessToken: accessJWTToken,
      refreshToken: refreshJWTToken,
    },
  });
}

/**
 * Handler for POST /auth/sign-up
 */
export async function register({ body, set }: RegisterContext) {
  // Hash password using Bun.password.hash (or replace with your own implementation)
  const password = await Bun.password.hash(body.password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  const user = await prisma.user.create({
    data: {
      ...body,
      password,
    },
    omit: {
      password: true,
      refreshToken: true,
      verificationToken: true,
      resetTokenExpiry: true,
      resetToken: true,
    },
  });

  return createResponse({
    success: true,
    message: "Account created successfully",
    data: { user },
  });
}

/**
 * Handler for POST /auth/refresh
 */
export async function refresh({
  cookie: { accessToken, refreshToken },
  jwt,
  set,
  error,
}: RefreshContext) {
  if (!refreshToken.value) {
    set.status = "Unauthorized";
    return error(
      501,
      createResponse({
        message: "Refresh token is missing",
        success: false,
        error: true,
      })
    );
  }

  // Verify refresh token
  const jwtPayload = await jwt.verify(refreshToken.value);
  if (!jwtPayload) {
    set.status = "Forbidden";

    return error(
      501,
      createResponse({
        message: "Refresh token is invalid",
        success: false,
        error: true,
      })
    );
  }

  // Verify user exists
  const userId = jwtPayload.sub;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    set.status = "Forbidden";

    return error(
      403,
      createResponse({
        message: "User not found",
        success: false,
        error: true,
      })
    );
  }

  // Generate new access token
  const accessJWTToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(ACCESS_TOKEN_EXP),
  });
  accessToken.set({
    value: accessJWTToken,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_EXP,
    path: "/",
  });

  // Generate new refresh token
  const refreshJWTToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(REFRESH_TOKEN_EXP),
  });
  refreshToken.set({
    value: refreshJWTToken,
    httpOnly: true,
    maxAge: REFRESH_TOKEN_EXP,
    path: "/",
  });

  // Update refresh token in database
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshJWTToken, lastLogin: new Date() },
  });

  return createResponse({
    success: true,
    message: "Refresh token generated successfully",
    data: {
      accessToken: accessJWTToken,
      refreshToken: refreshJWTToken,
    },
  });
}

/**
 * Handler for POST /auth/logout
 */
export async function logout({
  cookie: { accessToken, refreshToken },
  user,
}: LogoutContext) {
  // Remove cookies
  accessToken.remove();
  refreshToken.remove();

  // Update user status and remove stored refresh token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isOnline: false,
      refreshToken: null,
    },
  });

  return createResponse({
    success: true,
    message: "Logout successfully",
    data: null,
  });
}

/**
 * Handler for GET /auth/me
 */
export async function me({ user }: LogoutContext) {
  return createResponse({
    success: true,
    message: "Get user successfully",
    data: {
      user: {
        ...user,
        password: undefined,
        refreshToken: undefined,
        verificationToken: undefined,
      },
    },
  });
}
