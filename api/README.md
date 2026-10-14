# Smart School Management System - Backend API

REST API for the Smart School Management System built with Node.js and Express.

## Project Structure

```
api/
├── server.js                  # Main server entry point
├── package.json               # Dependencies
├── .env                       # Environment variables (local)
├── .env.example               # Environment variables template
├── config/
│   └── database.js            # MySQL connection pool
├── routes/
│   └── attendance.js          # Attendance endpoint routes
├── controllers/
│   └── attendanceController.js # Business logic for endpoints
├── middleware/
│   └── validation.js          # Request validation middleware
└── README.md                  # This file
```

## Endpoints

### 1. POST /api/attendance/scan
Records a student's attendance via NFC or QR code scan.

**Request Body:**
```json
{
  "student_id": 101,
  "check_in_method": "NFC",
  "device_id": "teacher-phone-001"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Attendance recorded successfully",
  "data": {
    "attendance_id": 1,
    "student_id": 101,
    "student_name": "John Doe",
    "check_in_time": "2026-05-25T09:30:00.000Z",
    "check_in_method": "NFC",
    "device_id": "teacher-phone-001",
    "status": "present"
  },
  "timestamp": "2026-05-25T09:30:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request` - Missing or invalid required fields
- `404 Not Found` - Student ID does not exist
- `409 Conflict` - Student already checked in today

---

### 2. GET /api/attendance/today
Fetches today's live attendance statistics and detailed roll call.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Today's attendance data retrieved successfully",
  "date": "2026-05-25",
  "statistics": {
    "total_students": 150,
    "present": 142,
    "absent": 5,
    "late": 3,
    "attendance_percentage": 94.67
  },
  "details": [
    {
      "id": 101,
      "name": "John Doe",
      "class": "10A",
      "check_in_time": "2026-05-25T09:15:30.000Z",
      "check_out_time": null,
      "check_in_method": "NFC",
      "status": "present"
    },
    {
      "id": 102,
      "name": "Jane Smith",
      "class": "10A",
      "check_in_time": null,
      "check_out_time": null,
      "check_in_method": null,
      "status": "absent"
    }
  ],
  "timestamp": "2026-05-25T10:00:00.000Z"
}
```

---

## Setup Instructions

### Prerequisites
- Node.js v14+ and npm
- MySQL Server (5.7+ or 8.0+)
- The database schema from `../database/01_schema.sql`

### Step 1: Install Dependencies

```bash
cd api
npm install
```

### Step 2: Configure Environment Variables

Copy `.env.example` to `.env` and update with your database credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
PORT=5001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_database_password
DB_NAME=smart_school
CLIENT_ORIGIN=http://localhost:5173
```

### Step 3: Set Up Database

1. Create the database and tables using `../database/01_schema.sql`.
2. For an existing database, apply `../database/08_auth_users.sql`.
3. Optionally load sample data from `../database/02_sample_data.sql`.
4. Run `npm run seed-students` if the `students` table is empty; it inserts
   `ASIFIWE Josue` (`MIPC/2026/0`) and otherwise leaves existing student data
   unchanged.
5. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD` (at least 12 characters), and
   `ADMIN_FULL_NAME` in `.env`, then run `npm run seed-admin` to create the
   first administrator. The password is stored as a bcrypt hash. No default
   password is provided. Remove the bootstrap password from `.env` after the
   account is created.

### Step 4: Start the Frontend and API

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The API listens on `http://localhost:5001` by default. Start the frontend in
another terminal with `cd client && npm install && npm run dev`; Vite proxies
`/api` requests to the API. For a separately hosted frontend, set
`VITE_API_URL` to the API origin (for example, configure it in the Vercel
project's environment variables to the Render API URL) and set `CLIENT_ORIGIN`
on the API to the frontend origin; use HTTPS and a same-site deployment so the
session cookie is sent by the browser.

Login uses an eight-hour, HttpOnly session cookie backed by PostgreSQL. The API
checks the user's role on protected routes; frontend route guards only control
navigation and do not replace server authorization. Fees endpoints require
`ADMIN` or `BURSAR`; discipline endpoints require `ADMIN` or `PATRON`.
Staff account registration is available at `/register` only to signed-in
administrators. Unauthenticated users can open the route for instructions and
are directed to administrator sign-in; the first administrator must be
provisioned with `seed-admin`.
State-changing API requests must include an `Origin` or `Referer` matching
`CLIENT_ORIGIN`; this check is in addition to CORS and the SameSite cookie.

---

## Testing the Endpoints

### Using cURL

**Test POST /api/attendance/scan:**
```bash
curl -X POST http://localhost:5000/api/attendance/scan \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": 1,
    "check_in_method": "NFC",
    "device_id": "teacher-device-001"
  }'
```

**Test GET /api/attendance/today:**
```bash
curl http://localhost:5000/api/attendance/today
```

### Using Postman

1. Open Postman
2. Create a new POST request to `http://localhost:5000/api/attendance/scan`
3. Set Body → raw → JSON and paste:
```json
{
  "student_id": 1,
  "check_in_method": "NFC",
  "device_id": "teacher-device-001"
}
```
4. Click Send

---

## Validation Rules

### POST /api/attendance/scan

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| student_id | integer | Yes | Must be numeric, must exist in students table |
| check_in_method | string | Yes | Must be 'NFC' or 'QR' (case-insensitive) |
| device_id | string | Yes | Non-empty string |

---

## Database Schema Requirements

The API expects these tables to exist:

**students** table:
- `id` (PRIMARY KEY)
- `name`
- `class`
- (and other student fields)

**attendance_logs** table:
- `id` (PRIMARY KEY)
- `student_id` (FOREIGN KEY → students.id)
- `check_in_time`
- `check_out_time` (nullable)
- `check_in_method` (NFC, QR, etc.)
- `device_id`
- `status` (present, absent, late)

See `../database/01_schema.sql` for complete schema.

---

## Features

✓ Input validation and error handling  
✓ MySQL connection pooling for performance  
✓ CORS enabled for cross-origin requests  
✓ Comprehensive error responses with timestamps  
✓ Transaction-safe attendance recording  
✓ Duplicate check-in prevention  
✓ Real-time attendance statistics  

---

## Next Steps

- Add authentication/authorization middleware
- Implement GET /api/students (list all students)
- Implement GET /api/attendance/:id (fetch by attendance ID)
- Add logging and monitoring
- Create unit and integration tests
- Add API documentation (Swagger/OpenAPI)

---

## Troubleshooting

### "Database connection failed"
- Verify MySQL is running
- Check credentials in `.env`
- Ensure database exists
- Check firewall/port 3306 accessibility

### "Student not found" error
- Verify student_id exists in database
- Load sample data: `mysql smart_school < ../database/02_sample_data.sql`

### "CORS error"
- CORS is enabled by default
- If issues persist, check browser console for specific error

---

## License

ISC
