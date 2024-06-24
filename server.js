// server.js

const express = require("express");
const OpenAI = require("openai");
const multer = require("multer");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const cors = require('cors');

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000; // Set your preferred port number
app.use(cors());
// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const corsOptions = {
  origin: '*',//(https://your-client-app.com)
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Endpoint for handling file upload and text input
app.post("/process-data", upload.single("file"), async (req, res) => {
  const file = req.file; // File metadata
    const text = req.body.text;
  try {
    
    console.log(text, "-----");

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY, // Access API key from environment variable
    });
    console.log("++++");
    const upload = await openai.files.create({
      file: fs.createReadStream(file.path),
      purpose: "assistants",
    });

    console.log(upload.id);

    console.log("uploaded file");

    const vectorStoreFile = await openai.beta.vectorStores.create({
      name: "Job helper",
    });

    console.log("created vector store");

    const vectorStore = await openai.beta.vectorStores.files.create(
      vectorStoreFile.id,
      {
        file_id: upload.id,
      }
    );

    console.log("updated vector store ");

    const assistant = await openai.beta.assistants.create({
      name: "Job Review Expert",
      instructions:
        "You are an expert job reviewer. Use your knowledge to create the perfect cover letter based on the resume and job description.",
      model: "gpt-4o",
      tools: [{ type: "file_search" }],
      tool_resources: {
        file_search: { vector_store_ids: [vectorStore.vector_store_id] },
      },
    });

    console.log("created assistant", assistant.id);

    const thread = await openai.beta.threads.create({
      messages: [
        {
          role: "user",
          content:
            `Here are the requirements for this job: ${text}`
        },
      ],
    });

    console.log("created thread", thread.id);

    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    });

    console.log("created run", run.id);

    const messages = await openai.beta.threads.messages.list(thread.id, {
      run_id: run.id,
    });

    const reply = messages.data[0].content[0].text.value;

    console.log("created messages", reply);

    res.status(200).json(reply); // Send response as JSON
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  } finally {
    fs.unlink(file.path, (err) => {
      if(err) {
        console.error(err)
      } else {
        console.log("files deleted")
      }
    })
  }
});

// Handle OPTIONS requests for CORS preflight
app.options("*", (req, res) => {
  res.status(200).send("OK").set(corsHeaders);
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
