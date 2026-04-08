import express from "express"
import path from "path"
import mainRouter from "./mainRouter"
import cookieParser from "cookie-parser";
import { globalErrorHandler } from "./middleware/globalErrorHandler"
import { setupSwagger } from "./swagger";
import cors from "cors";
import "dotenv/config";

const app = express()
const PORT = Number(process.env.PORT) || 3000
const allowedOrigins = [
  "https://alivepost.com",
  "https://api.alivepost.com",
  "http://api.alivepost.com",
  "http://localhost:3000",
  "http://localhost:3001",
]

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error("Not allowed by CORS"))
    }
  },
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

// Serve static files (notification test page, service worker, etc.)
app.use(express.static(path.join(__dirname, "../public")))

// Setup Swagger UI
setupSwagger(app);

app.use('/api/v1/', mainRouter)
app.get('/health', (req, res) => {
  res.status(200).json({
    msg: "Yes baby! server is up and running"
  })
})
app.use(globalErrorHandler)

const server = app.listen(PORT, () => {
  console.log(`[ READY ] Server is running at http://localhost:${PORT}`);
});

server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please kill existing processes running on this port.`);
    process.exit(1);
  } else {
    console.error('Server error:', error);
  }
});

process.on('exit', (code) => console.log('Exited with code', code));
process.on('uncaughtException', e => console.log('Uncaught', e));
