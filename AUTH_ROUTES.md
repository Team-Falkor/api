# Authentication Routes Documentation

## POST /auth/login

**Description**: Authenticates a user and returns access/refresh tokens.

**Request Body**:

```json
{
  "email": "string",
  "password": "string"
}
```

**Success Response**:

```json
{
  "success": true,
  "message": "Signed in successfully",
  "data": {
    "user": {
      "id": "string",
      "email": "string",
      "username": "string",
      "role": "string",
      "isOnline": boolean,
      "lastLogin": "ISO date string",
      "createdAt": "ISO date string"
    },
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

---

## POST /auth/sign-up

**Description**: Creates a new user account.

**Request Body**:

```json
{
  "email": "string",
  "username": "string",
  "password": "string"
}
```

**Success Response**:

```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "id": "string",
      "email": "string",
      "username": "string",
      "role": "string",
      "createdAt": "ISO date string"
    }
  }
}
```

**Error Response (Duplicate Email)**:

```json
{
  "name": "Error",
  "message": "The email address provided already exists"
}
```

---

## POST /auth/refresh

**Description**: Refreshes access token using refresh token.

**Required Cookies**:

- `refreshToken`: Valid refresh token

**Success Response**:

```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

---

## POST /auth/logout

**Description**: Logs out the current user.

**Required Cookies**:

- `accessToken`: Valid access token

**Success Response**:

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## GET /auth/me

**Description**: Gets current user profile.

**Required Cookies**:

- `accessToken`: Valid access token

**Success Response**:

```json
{
  "success": true,
  "message": "User profile fetched",
  "data": {
    "user": {
      "id": "string",
      "email": "string",
      "username": "string",
      "role": "string",
      "isOnline": boolean,
      "lastLogin": "ISO date string",
      "createdAt": "ISO date string"
    }
  }
}
```
