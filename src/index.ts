import dotenv from "dotenv";
import { initSocket } from './config/socket';
dotenv.config({ path: './.env' });

import connectDB from './db/db';
import http from 'http';
import { app } from "./app";

const server = http.createServer(app);

// Initialize Socket.io with the HTTP server
initSocket(server);

connectDB().then(() => {
    server.on("error", (error) => {
        console.log(`Server Connection Error: ${error}`);
    });
    server.listen(process.env.PORT || 8000, () => {
        console.log(`⚙️  Server Connected On Port: ${process.env.PORT}\n`);
    });
}).catch((err) => {
    console.log("MongoDB Connection Failed!!", err);
});




