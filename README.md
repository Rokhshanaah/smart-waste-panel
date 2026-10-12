# Smart Waste Management Panel

A practical single-panel waste-management system built with:

- Node.js + Express
- React + Vite
- MySQL
- JWT authentication
- Role-based menu access
- Full add, edit, delete and list operations for core modules
- RTL Persian/Dari interface

## Default admin

After importing the database, run the backend seed command:

```bash
cd backend
npm install
cp .env.example .env
npm run seed
npm run dev
```

Admin login:

- Email: `admin@municipality.local`
- Password: `Admin@123`

## Database import

Create a MySQL database and import:

```bash
mysql -u root -p < database/smart_waste.sql
```

Or import `database/smart_waste.sql` using phpMyAdmin.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.
The API runs at `http://localhost:5000`.

## Main modules

- Dashboard
- Citizens
- Areas
- Bills
- Payments
- Employees
- Trucks
- Collection schedules
- Recycling
- Expenses
- Complaints
- Users and access roles
