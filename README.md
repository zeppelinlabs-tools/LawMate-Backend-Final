# LawMate Backend

This is the backend repository for the **LawMate** project, built with Node.js, Express, and MongoDB.

##  Features

* **AI-Powered Chat:** Real-time communication with the LawMate AI.
* **Document Generation:** Automated legal document creation.
* **Notification System:** Real-time updates for users.
* **Secure Authentication:** JWT-based user login and registration.

##  Prerequisites

Ensure you have the following installed on your machine:

* [Node.js](https://nodejs.org/) (v18 or higher)
* [npm](https://www.npmjs.com/)
* [MongoDB](https://www.mongodb.com/) (or MongoDB Atlas account)

##  Setup Instructions

1. **Clone the repository:**
```bash
git clone <your-repo-link>
cd <your-project-folder>

```


2. **Install dependencies:**
```bash
npm install

```

3. **Environment Configuration:**
* Create a `.env` file in the root directory by copying the example file:
```bash
cp .env.example .env

```
* Open the `.env` file and fill in the following credentials:
```env
PORT=4000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key

```
4. **Run the server:**
* For development mode (with auto-reload):
```bash
npm run dev
```

* For production mode:
```bash
npm start

```
## 🔌 API Endpoints
| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/auth/register` | POST | Register a new user |
| `/api/chat` | POST | Send a message to the AI chatbot |
| `/api/documents/generate` | POST | Generate a new legal document |
| `/api/notifications` | GET | Retrieve user notifications |
## 🧪 Testing
Use the provided `LawMate_Collection.json` file in **Postman** to test the API endpoints.
*Built with ❤️ for LawMate.*
