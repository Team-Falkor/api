import bcrypt from "bcryptjs";
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
  const user = await prisma.user.findUnique({
    where: { email: body.email },
  });

  if (!user || !(await bcrypt.compare(body.password, user.password))) {
    return error(
      401,
      createResponse({
        message: "Invalid email or password",
        success: false,
        error: true,
      })
    );
  }

  const accessJWTToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(ACCESS_TOKEN_EXP),
  });

  const refreshJWTToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(REFRESH_TOKEN_EXP),
  });

  accessToken.set({
    value: accessJWTToken,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_EXP,
    path: "/",
    sameSite: "lax",
    secure: true,
  });

  refreshToken.set({
    value: refreshJWTToken,
    httpOnly: true,
    maxAge: REFRESH_TOKEN_EXP,
    path: "/",
    sameSite: "lax",
    secure: true,
  });

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      isOnline: true,
      refreshToken: refreshJWTToken,
      lastLogin: new Date(),
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isOnline: true,
      lastLogin: true,
      createdAt: true,
    },
  });

  return createResponse({
    success: true,
    message: "Signed in successfully",
    data: {
      user: updatedUser,
      accessToken: accessJWTToken,
      refreshToken: refreshJWTToken,
    },
  });
}

export async function register({ body, set }: RegisterContext) {
  const hashedPassword = await bcrypt.hash(body.password, 10);

  const newUser = await prisma.user.create({
    data: {
      email: body.email,
      username: body.username,
      password: hashedPassword,
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  return createResponse({
    success: true,
    message: "Account created successfully",
    data: { user: newUser },
  });
}

export async function refresh({
  cookie: { accessToken, refreshToken },
  jwt,
  set,
  error,
}: RefreshContext) {
  if (!refreshToken.value) {
    return error(
      401,
      createResponse({
        message: "Missing refresh token",
        success: false,
        error: true,
      })
    );
  }
  const payload = await jwt.verify(refreshToken.value);
  if (!payload || typeof payload.sub !== "string") {
    return error(
      403,
      createResponse({
        message: "Invalid or expired refresh token",
        success: false,
        error: true,
      })
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user || user.refreshToken !== refreshToken.value) {
    return error(
      403,
      createResponse({
        message: "Refresh token not recognized",
        success: false,
        error: true,
      })
    );
  }

  const newAccessToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(ACCESS_TOKEN_EXP),
  });

  const newRefreshToken = await jwt.sign({
    sub: user.id,
    exp: getExpTimestamp(REFRESH_TOKEN_EXP),
  });

  accessToken.set({
    value: newAccessToken,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_EXP,
    path: "/",
    sameSite: "lax",
    secure: true,
  });

  refreshToken.set({
    value: newRefreshToken,
    httpOnly: true,
    maxAge: REFRESH_TOKEN_EXP,
    path: "/",
    sameSite: "lax",
    secure: true,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: newRefreshToken,
      lastLogin: new Date(),
    },
  });

  return createResponse({
    success: true,
    message: "Token refreshed",
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    },
  });
}

export async function logout({
  cookie: { accessToken, refreshToken },
  user,
}: LogoutContext) {
  accessToken.remove();
  refreshToken.remove();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isOnline: false,
      refreshToken: null,
    },
  });

  return createResponse({
    success: true,
    message: "Logged out successfully",
  });
}

export async function me({ user }: LogoutContext) {
  return createResponse({
    success: true,
    message: "User profile fetched",
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
