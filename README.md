# VIP Management Backend

MongoDB-based backend for the hostel volunteer platform.

## Stack

- Node.js + TypeScript
- Express
- MongoDB + Mongoose
- JWT authentication
- Socket.IO for realtime-ready events
- Zod validation

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Then add your Mongo connection string to `.env`:

```env
MONGODB_URL=your-mongodb-url
```

## Scripts

```bash
cd backend
npm run dev
npm run build
npm run start
npm run seed
```

## API Areas

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard/admin-overview`
- `GET /api/volunteers`
- `GET /api/volunteers/:userId`
- `POST /api/volunteers`
- `PUT /api/volunteers/:userId`
- `PATCH /api/volunteers/:userId/toggle-active`
- `GET /api/tasks`
- `GET /api/tasks/available`
- `GET /api/tasks/mine`
- `POST /api/tasks`
- `PUT /api/tasks/:taskId`
- `PATCH /api/tasks/:taskId/publish`
- `PATCH /api/tasks/:taskId/toggle-cancelled`
- `POST /api/tasks/:taskId/claim`
- `POST /api/tasks/:taskId/release`
- `POST /api/tasks/:taskId/complete`
- `POST /api/tasks/scheduler/run`
- `GET /api/packs`
- `POST /api/packs`
- `PUT /api/packs/:packId`
- `PATCH /api/packs/:packId/toggle-active`
- `POST /api/packs/:packId/assign`
- `GET /api/routine-tasks`
- `POST /api/routine-tasks`
- `PUT /api/routine-tasks/:taskId`
- `PATCH /api/routine-tasks/:taskId/toggle-active`
- `POST /api/routine-tasks/:taskId/assign`
- `GET /api/rewards`
- `GET /api/rewards/redemptions`
- `POST /api/rewards`
- `PUT /api/rewards/:rewardId`
- `PATCH /api/rewards/:rewardId/toggle-active`
- `POST /api/rewards/:rewardId/redeem`

## Structure

- `src/db`: Mongo connection bootstrap
- `src/models`: Mongoose models
- `src/routes`: route layer
- `src/services`: business logic
- `src/middlewares`: auth and error handling
- `src/realtime`: Socket.IO bootstrap

## Notes

- The frontend remains untouched.
- Prisma and PostgreSQL were removed from the backend.
- Once you send the MongoDB URL, I can wire the real seed data and run an end-to-end validation against your database.
