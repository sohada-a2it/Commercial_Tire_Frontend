# Asian Import Export Co - Backend API Documentation

## Base URL
```
http://localhost:3001/api
```

## User Endpoints

### 1. Register/Update User
**Endpoint:** `POST /users/register`

**Description:** Register a new user or update existing user after Firebase authentication.

**Request Body:**
```json
{
  "firebaseUid": "string (required)",
  "fullName": "string (required)",
  "email": "string (required)",
  "companyName": "string (optional)",
  "whatsappNumber": "string (optional)",
  "country": "string (optional)",
  "businessType": "Wholesaler | Retailer | Other (optional)",
  "provider": "email | google (optional, default: email)",
  "photoURL": "string (optional)"
}
```

**Response (201 Created or 200 Updated):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "string",
    "firebaseUid": "string",
    "companyName": "string",
    "fullName": "string",
    "email": "string",
    "whatsappNumber": "string",
    "country": "string",
    "businessType": "string",
    "provider": "string",
    "photoURL": "string",
    "role": "user | admin"
  }
}
```

---

### 2. Get All Users (Dashboard)
**Endpoint:** `GET /users`

**Description:** Get paginated list of all users with search and filter options (for admin dashboard).

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 10) - Number of users per page
- `search` (optional) - Search by name, email, company, or phone
- `country` (optional) - Filter by country
- `businessType` (optional) - Filter by business type

**Example:**
```
GET /users?page=1&limit=10&search=john&country=Bangladesh&businessType=Wholesaler
```

**Response (200 OK):**
```json
{
  "success": true,
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10,
  "users": [
    {
      "id": "string",
      "firebaseUid": "string",
      "companyName": "string",
      "fullName": "string",
      "email": "string",
      "whatsappNumber": "string",
      "country": "string",
      "businessType": "Wholesaler | Retailer | Other",
      "provider": "email | google",
      "photoURL": "string",
      "role": "user | admin",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
}
```

---

### 3. Get User Profile
**Endpoint:** `GET /users/profile/:firebaseUid`

**Description:** Get a specific user's profile by their Firebase UID.

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "firebaseUid": "string",
    "companyName": "string",
    "fullName": "string",
    "email": "string",
    "whatsappNumber": "string",
    "country": "string",
    "businessType": "string",
    "provider": "string",
    "photoURL": "string",
    "role": "user | admin",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
}
```

---

### 4. Update User Profile
**Endpoint:** `PUT /users/profile/:firebaseUid`

**Description:** Update user profile information.

**Request Body:**
```json
{
  "companyName": "string (optional)",
  "fullName": "string (optional)",
  "whatsappNumber": "string (optional)",
  "country": "string (optional)",
  "businessType": "Wholesaler | Retailer | Other (optional)",
  "photoURL": "string (optional)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "id": "string",
    "firebaseUid": "string",
    "companyName": "string",
    "fullName": "string",
    "email": "string",
    "whatsappNumber": "string",
    "country": "string",
    "businessType": "string",
    "provider": "string",
    "photoURL": "string",
    "role": "user | admin"
  }
}
```

---

## Email Endpoints

### 5. Send Product Inquiry Email
**Endpoint:** `POST /send-email`

**Description:** Send product inquiry email.

**Request Body:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string (optional)",
  "company": "string (optional)",
  "message": "string",
  "address": "string (optional)",
  "quantity": "number",
  "model": "string",
  "type": "product_inquiry",
  "shippingTerm": "string (optional)"
}
```

---

### 6. Send Order Invoice
**Endpoint:** `POST /send-invoice`

**Description:** Send order confirmation invoice to customer and admin.

**Request Body:**
```json
{
  "customer": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "address": "string",
    "city": "string",
    "state": "string",
    "zipCode": "string",
    "notes": "string (optional)"
  },
  "items": [
    {
      "name": "string",
      "quantity": number,
      "price": number
    }
  ],
  "subtotal": number,
  "total": number,
  "orderDate": "ISO date string",
  "paymentMethod": "credit-card | bank-transfer"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "orderId": "string",
  "message": "Invoice sent successfully"
}
```

---

## Error Responses

All endpoints may return error responses in the following format:

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Error description"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

---

## Frontend Integration Notes

### Dashboard Implementation

1. **Dashboard Access:** After login, show a "Dashboard" option in the user profile menu (before "Sign Up")

2. **Navigation Flow:**
   - User clicks "Dashboard" → Navigate to `/dashboard`
   - User clicks "Place Order" → Navigate to `/dashboard`

3. **Dashboard Structure:**
   ```
   /dashboard
   ├── Sidebar
   │   ├── Users (Admin only)
   │   ├── Orders
   │   ├── Profile
   │   └── Settings
   └── Main Content
       └── User List (when Users selected)
   ```

4. **Fetching User List:**
   ```javascript
   // Example API call
   const fetchUsers = async (page = 1, search = "") => {
     const response = await fetch(
       `http://localhost:3001/api/users?page=${page}&limit=10&search=${search}`
     );
     const data = await response.json();
     return data;
   };
   ```

5. **User List Display:**
   - Show table with columns: Customer, Company, Contact, Location, Business Type, Joined, Actions
   - Implement search functionality
   - Add filters for Country and Business Type
   - Pagination controls

### Role-Based Access Control

The User model includes a `role` field (`user` or `admin`). Implement middleware to:
- Allow only admins to access `/api/users` endpoint
- Show Dashboard sidebar "Users" option only for admins
- Regular users should only see their own profile

---

## Database Schema

### User Model
```javascript
{
  firebaseUid: String (required, unique),
  companyName: String,
  fullName: String (required),
  email: String (required, unique),
  whatsappNumber: String,
  country: String,
  businessType: String (enum: ["Wholesaler", "Retailer", "Other"]),
  provider: String (enum: ["email", "google"], default: "email"),
  photoURL: String,
  role: String (enum: ["user", "admin"], default: "user"),
  timestamps: true (createdAt, updatedAt)
}
```
