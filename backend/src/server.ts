import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import attendanceRoutes from "./routes/attendance";
import seedRoutes from "./routes/seed";
import { db } from "./database";

const app = express();
app.set("trust proxy", 0);

const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

const isProd = process.env.NODE_ENV === "production";

if (isProd) {
   const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
   });
   app.use("/api/", limiter);
} else {
   console.log("[DEV] rateLimit disabled");
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
   res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// routes
app.use("/api/seed", seedRoutes);
app.use("/api/attendance", attendanceRoutes);

// error handler (setelah routes)
app.use(
   (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
   ) => {
      console.error("Error:", err);
      res.status(500).json({ error: "Internal server error" });
   }
);

app.get("/", (_req, res) => {
   res.json({
      status: "OK",
      service: "attendance-api",
      routes: ["/health", "/api/attendance/*", "/api/seed/*"],
   });
});

process.on("SIGINT", () => {
   console.log("Shutting down gracefully...");
   db.close();
   process.exit(0);
});

process.on("SIGTERM", () => {
   console.log("Shutting down gracefully...");
   db.close();
   process.exit(0);
});

app.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
   console.log(`Health check available at http://localhost:${PORT}/health`);
});
