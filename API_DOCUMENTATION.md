# Asian Import Export Co Backend API Documentation

Last updated: April 1, 2026

## 1) Overview

This backend is an Express + MongoDB API that supports:
- User profile persistence for Firebase-authenticated users
- Customer inquiry email delivery
- Order invoice email delivery

Authentication for end users (email/password and Google) is handled by Firebase in the frontend. The backend stores and manages user profile records by Firebase UID.

Base URL examples:
- Local: http://localhost:5000
- Production: your deployed backend domain (for example Vercel URL)

## 2) Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- Nodemailer (SMTP)
- CORS enabled with allowlist

## 3) Runtime and Environment Variables

Required for backend:
- PORT (optional, defaults to 5000)
- MONGODB_URI (required)
- SMTP_HOST (optional, defaults to smtp.hostinger.com)
- SMTP_PORT (optional, defaults to 465)
- SMTP_USER (required for email sending)
- SMTP_PASSWORD (required for email sending)
- OWNER_EMAIL (optional fallback in templates)
- FRONTEND_URL (optional, added to CORS allowlist)

Frontend environment expected:
- NEXT_PUBLIC_BACKEND_URL (for calling this backend)

## 4) CORS Policy

Allowed origins include:
- FRONTEND_URL (if provided)
- http://localhost:3000
- http://127.0.0.1:3000
- https://asianimportexport.com
- https://www.asianimportexport.com

Methods allowed:
- GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD

Headers allowed:
- Content-Type, Authorization

## 5) Data Model

### User

Collection: users

Fields:
- firebaseUid: string, required, unique
- companyName: string, optional
- fullName: string, required
- email: string, required, unique, lowercase
- whatsappNumber: string, optional
- country: string, optional
- provider: enum(email, google), default email
- photoURL: string, optional
- role: enum(user, admin), default user
- businessType: enum(Wholesaler, Retailer, Other), optional
- createdAt: date (auto)
- updatedAt: date (auto)

Indexes:
- email
- firebaseUid

## 6) API Endpoint Index (A to Z)

- GET /api/users
- GET /api/users/profile/:firebaseUid
- POST /api/send-email
- POST /api/send-invoice
- POST /api/users/register
- PUT /api/users/profile/:firebaseUid
- DELETE /api/users/:firebaseUid

## 7) User APIs (Full CRUD)

### 7.1 Create or Upsert User

Endpoint:
- POST /api/users/register

Description:
- Creates a new user if firebaseUid does not exist.
- If firebaseUid exists, updates that existing user (upsert-style behavior).

Request body:
- firebaseUid: string (required)
- email: string (required)
- fullName: string (required)
- companyName: string (optional)
- whatsappNumber: string (optional)
- country: string (optional)
- provider: email | google (optional)
- photoURL: string (optional)
- businessType: Wholesaler | Retailer | Other (optional)

Success responses:
- 201 Created (new user)
- 200 OK (existing user updated)

Example success payload:
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "...",
    "firebaseUid": "...",
    "companyName": "...",
    "fullName": "...",
    "email": "...",
    "whatsappNumber": "...",
    "country": "...",
    "provider": "google",
    "photoURL": "...",
    "businessType": "Wholesaler",
    "role": "user"
  }
}

Error responses:
- 400 if required fields are missing
- 400 if email already exists for different firebaseUid
- 500 on server/database errors

### 7.2 Read All Users (with search/filter/pagination)

Endpoint:
- GET /api/users

Query params:
- page: number (default 1)
- limit: number (default 10)
- search: string (default empty)
- country: string (default empty)
- businessType: string (default empty)

Behavior:
- search matches fullName, email, companyName, whatsappNumber (case-insensitive regex)
- results sorted by createdAt descending

Success response:
- 200 OK

Example response:
{
  "success": true,
  "total": 54,
  "page": 1,
  "limit": 10,
  "totalPages": 6,
  "users": [
    {
      "id": "...",
      "firebaseUid": "...",
      "companyName": "N/A",
      "fullName": "John Doe",
      "email": "john@example.com",
      "whatsappNumber": "Not provided",
      "country": "Not specified",
      "businessType": "Other",
      "provider": "email",
      "photoURL": "...",
      "role": "user",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}

Error responses:
- 500 on query failure

### 7.3 Read Single User Profile

Endpoint:
- GET /api/users/profile/:firebaseUid

Path params:
- firebaseUid: string (required)

Success response:
- 200 OK

Error responses:
- 400 if firebaseUid is missing
- 404 if user not found
- 500 on server/database errors

### 7.4 Update User Profile

Endpoint:
- PUT /api/users/profile/:firebaseUid

Path params:
- firebaseUid: string (required)

Request body (all optional, only provided fields are updated):
- companyName
- fullName
- whatsappNumber
- country
- photoURL
- businessType

Success response:
- 200 OK

Error responses:
- 400 if firebaseUid missing
- 404 if user not found
- 500 on server/database errors

### 7.5 Delete User

Endpoint:
- DELETE /api/users/:firebaseUid

Path params:
- firebaseUid: string (required)

Success response:
- 200 OK

Example success payload:
{
  "success": true,
  "message": "User deleted successfully",
  "user": {
    "id": "...",
    "firebaseUid": "...",
    "email": "..."
  }
}

Error responses:
- 400 if firebaseUid missing
- 404 if user not found
- 500 on server/database errors

## 8) Email APIs

### 8.1 Send General/Product Inquiry Email

Endpoint:
- POST /api/send-email

Description:
- Sends inquiry email to sales inbox.
- Supports two content modes:
  - product_inquiry
  - general inquiry (default path when type is not product_inquiry)

Request body (common):
- name
- email
- phone (optional)
- company (optional)
- message

Additional for product inquiry:
- type: product_inquiry
- model
- quantity
- address (optional)
- shippingTerm (optional)

Additional for general inquiry:
- subject (optional)

Success response:
- 200 OK
{
  "success": true
}

Error response:
- 500
{
  "error": "Failed to send email"
}

### 8.2 Send Order Invoice Email

Endpoint:
- POST /api/send-invoice

Description:
- Generates and sends invoice/confirmation email to customer.
- Sends admin notification email with order details.

Request body:
- customer: {
  - name
  - email
  - phone
  - address
  - city
  - state
  - zipCode
  - notes (optional)
}
- items: array of {
  - name
  - quantity
  - price
}
- subtotal: number
- total: number
- orderDate: ISO string
- paymentMethod: credit-card | bank-transfer (or any frontend-provided value)

Success response:
- 200 OK
{
  "success": true,
  "orderId": "ORD-...",
  "message": "Invoice sent successfully"
}

Error response:
- 500
{
  "error": "Failed to send invoice"
}

## 9) Google Authentication Flow (End-to-End)

Important: Google OAuth login happens in Firebase on the frontend. Backend does not verify Google tokens in the current implementation. Backend stores profile data keyed by Firebase UID.

Sequence:
1. Frontend calls Firebase signInWithPopup with Google provider.
2. Firebase returns authenticated user object (uid, email, displayName, photoURL).
3. Frontend calls POST /api/users/register with provider=google.
4. Backend creates/updates MongoDB user record by firebaseUid.
5. Frontend stores auth state and uses GET /api/users/profile/:firebaseUid for profile sync.

Related frontend actions:
- Email/password signup:
  - Firebase createUserWithEmailAndPassword
  - POST /api/users/register with provider=email
- Email/password sign in:
  - Firebase signInWithEmailAndPassword
  - GET /api/users/profile/:firebaseUid
- Profile update:
  - PUT /api/users/profile/:firebaseUid
- Dashboard users list:
  - GET /api/users

## 10) CRUD Matrix

User resource CRUD coverage:
- Create: POST /api/users/register
- Read (all): GET /api/users
- Read (one): GET /api/users/profile/:firebaseUid
- Update: PUT /api/users/profile/:firebaseUid
- Delete: DELETE /api/users/:firebaseUid

Inquiry/order resources:
- Create/send inquiry: POST /api/send-email
- Create/send invoice: POST /api/send-invoice
- Read/Update/Delete for inquiries/orders are not implemented in this backend

## 11) Example cURL Requests

Create or update user:
curl -X POST "http://localhost:5000/api/users/register" -H "Content-Type: application/json" -d "{\"firebaseUid\":\"uid_123\",\"email\":\"john@example.com\",\"fullName\":\"John Doe\",\"provider\":\"google\"}"

Get all users:
curl "http://localhost:5000/api/users?page=1&limit=10&search=john"

Get profile:
curl "http://localhost:5000/api/users/profile/uid_123"

Update profile:
curl -X PUT "http://localhost:5000/api/users/profile/uid_123" -H "Content-Type: application/json" -d "{\"companyName\":\"Acme Ltd\",\"businessType\":\"Wholesaler\"}"

Delete user:
curl -X DELETE "http://localhost:5000/api/users/uid_123"

Send general inquiry:
curl -X POST "http://localhost:5000/api/send-email" -H "Content-Type: application/json" -d "{\"name\":\"Alice\",\"email\":\"alice@example.com\",\"message\":\"Need product catalog\",\"type\":\"general\"}"

Send invoice:
curl -X POST "http://localhost:5000/api/send-invoice" -H "Content-Type: application/json" -d "{\"customer\":{\"name\":\"Alice\",\"email\":\"alice@example.com\",\"phone\":\"123\",\"address\":\"street\",\"city\":\"city\",\"state\":\"state\",\"zipCode\":\"12345\"},\"items\":[{\"name\":\"Product A\",\"quantity\":10,\"price\":20}],\"subtotal\":200,\"total\":200,\"orderDate\":\"2026-04-01T10:00:00.000Z\",\"paymentMethod\":\"credit-card\"}"

## 12) Notes and Recommendations

Current security model:
- Backend trusts frontend-provided firebaseUid/email in user endpoints.
- There is no Firebase ID token verification middleware yet.

Recommended next production hardening:
- Add Firebase Admin token verification middleware for protected routes
- Restrict dashboard user list and delete endpoints to admin role
- Add request validation (for example with Zod/Joi/express-validator)
- Add rate limiting and structured logging

