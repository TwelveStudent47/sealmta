import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
import { error } from "console";
import session from "express-session";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
db.connect();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

async function checkForumAdminPermission(req, res, next) {
  if (!req.session.username) {
    return res.redirect("/");
  }

  try {
    const userRes = await db.query(
      "SELECT is_forum_admin FROM users WHERE username = $1",
      [req.session.username]
    );

    if (userRes.rows.length === 0 || !userRes.rows[0].is_forum_admin) {
      return res
        .status(403)
        .json({ error: "Nincs jogosultságod ehhez a művelethez" });
    }

    next();
  } catch (err) {
    console.error("Adatbázis hiba:", err);
    return res.status(500).json({ error: "Szerver hiba" });
  }
}

async function checkMainThreadPermission(req, res, next) {
  if (!req.session.username) {
    return res.redirect("/");
  }

  try {
    const userRes = await db.query(
      "SELECT can_create_main_threads FROM users WHERE username = $1",
      [req.session.username]
    );

    if (userRes.rows.length === 0 || !userRes.rows[0].can_create_main_threads) {
      return res
        .status(403)
        .json({ error: "Nincs jogosultságod főtémák létrehozásához" });
    }

    next();
  } catch (err) {
    console.error("Adatbázis hiba:", err);
    return res.status(500).json({ error: "Szerver hiba" });
  }
}

async function getUserPermissions(username) {
  try {
    const userRes = await db.query(
      "SELECT is_forum_admin, can_create_main_threads FROM users WHERE username = $1",
      [username]
    );
    if (userRes.rows.length > 0) {
      return {
        isAdmin: userRes.rows[0].is_forum_admin || false,
        canCreateMainThreads: userRes.rows[0].can_create_main_threads || false,
      };
    }
    return { isAdmin: false, canCreateMainThreads: false };
  } catch (err) {
    console.error("Hiba a jogosultságok lekérésénél:", err);
    return { isAdmin: false, canCreateMainThreads: false };
  }
}

async function getUserAdminStatus(username) {
  const permissions = await getUserPermissions(username);
  return permissions.isAdmin;
}

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.post("/register", async (req, res) => {
  if (
    req.body.registerUser == "" ||
    req.body.registerPass == "" ||
    req.body.registerEmail == ""
  ) {
    res.render("index.ejs", { error: "Hiba történt regisztráció közben." });
  } else {
    const { registerUser, registerPass, registerEmail } = req.body;
    const otpPassword = Math.floor(Math.random() * 999999);

    req.session.registrationData = {
      registerUser,
      registerPass,
      registerEmail,
      otpPassword
    };

    res.redirect("/otp");
  }
});

app.get("/otp", async (req, res) => {
  if (!req.session.registrationData) {
    return res.redirect("/register");
  }
  
  const { registerUser, registerPass, registerEmail, otpPassword } = req.session.registrationData;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "sealmta4@gmail.com",
      pass: process.env.GOOGLE_APP_PASSWORD,
    },
  });
  await transporter.verify();
  console.log("Server is ready to take our messages");
  (async () => {
    try {
      const info = await transporter.sendMail({
        from: '"SealMTA" <sealmta4@gmail.com>',
        to: registerEmail,
        subject: "Sikeres regisztráció – Erősítsd meg fiókodat!",
        html: "<h1>Kedves " + registerUser + "!</h1><br><p>Köszönjük, hogy regisztráltál a fórumunkra! A regisztráció véglegesítéséhez kérjük, használd az alábbi megerősítő kódot:</p><br><h3>" + otpPassword + "</h3><br><p>Ha nem Te kezdeményezted ezt a regisztrációt, kérjük, hagyd figyelmen kívül ezt az e-mailt.<br>Bármilyen kérdés esetén állunk rendelkezésedre!<br><br><p>Üdvözlettel:</p><br><h3>A SealMTA csapata</h3><br><p>sealmta4@gmail.com</p><br><p>sealmta.hu</p>", 
      });

      console.log("Message sent: %s", info.messageId);
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    } catch (err) {
      console.error("Error while sending mail", err);
    }
  })();
  res.render("otp.ejs", {regEmail : registerEmail});
});

app.post("/verify-otp", async (req, res) => {
  const { registerUser, registerPass, registerEmail, otpPassword } = req.session.registrationData;
  const givenOtpPassword = req.body.otpInput;
  if (givenOtpPassword == otpPassword) {
    try {
      const hashedPassword = await bcrypt.hash(registerPass, saltRounds);

      await db.query(
        "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)",
        [registerUser, registerEmail, hashedPassword]
      );

      res.render("index.ejs", { success: "Sikeres regisztráció!" });
    } catch (err) {
      console.error(err);
      res.render("index.ejs", { error: "Hiba történt regisztráció közben." });
    }
  } else {
    res.render("index.ejs", { error : "Rossz kódot adtál meg."});
  }
});

app.post("/login", async (req, res) => {
  const { loginUser, loginPass } = req.body;

  try {
    const result = await db.query("SELECT * FROM users WHERE username = $1", [
      loginUser,
    ]);

    if (result.rows.length === 0) {
      return res.render("index.ejs", { error: "Nincs ilyen felhasználó." });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(loginPass, user.password_hash);

    if (passwordMatch) {
      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET,
        {
          expiresIn: "2h",
        }
      );
      req.session.username = user.username;
      req.session.userId = user.id;
      res.redirect("/forum");
    } else {
      res.render("index.ejs", { error: "Hibás jelszó." });
    }
  } catch (err) {
    console.error(err);
    res.render("index.ejs", { error: "Hiba történt bejelentkezés közben." });
  }
});

app.post("/forgot-password", async (req, res) => {
  const email = req.body.forgotPasswordEmail;
  try {
    const user = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (user.rows.length === 0) {
      return res.render("index.ejs", { error: "Nincs ilyen email cím." });
    }

    const token = crypto.randomBytes(32).toString("hex");

    await db.query("UPDATE users SET reset_token = $1 WHERE email = $2", [
      token,
      email,
    ]);

    const resetLink = `http://localhost:${port}/reset-password/${token}`;
    res.render("index.ejs", { link: resetLink });
  } catch (err) {
    console.error(err);
    res.render("index.ejs", { error: "Hiba történt." });
  }
});

app.get("/reset-password/:token", async (req, res) => {
  const { token } = req.params;

  const user = await db.query("SELECT * FROM users WHERE reset_token = $1", [
    token,
  ]);

  if (user.rows.length === 0) {
    return res.render("index.ejs", { error: "Érvénytelen vagy lejárt token." });
  }

  res.render("reset-password.ejs", { token });
});

app.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const user = await db.query("SELECT * FROM users WHERE reset_token = $1", [
      token,
    ]);

    if (user.rows.length === 0) {
      return res.render("index.ejs", { error: "Érvénytelen token." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await db.query(
      "UPDATE users SET password_hash = $1, reset_token = NULL WHERE reset_token = $2",
      [hashedPassword, token]
    );

    res.render("index.ejs", { success: "Sikeresen megváltozott a jelszó." });
  } catch (err) {
    console.error(err);
    res.render("index.ejs", { error: "Hiba történt jelszó módosításkor." });
  }
});

async function getThreadsHierarchy(categoryId = null, parentId = null) {
  let query = `
    SELECT t.*, c.name as category_name 
    FROM threads t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE 1=1
  `;
  let params = [];

  if (categoryId) {
    query += ` AND t.category_id = $${params.length + 1}`;
    params.push(categoryId);
  }

  if (parentId) {
    query += ` AND t.parent_id = $${params.length + 1}`;
    params.push(parentId);
  } else {
    query += ` AND t.parent_id IS NULL`;
  }

  query += ` ORDER BY t.created_at DESC`;

  const result = await db.query(query, params);
  return result.rows;
}

async function getSubthreads(parentId) {
  const result = await db.query(
    `
    SELECT t.*, c.name as category_name 
    FROM threads t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.parent_id = $1
    ORDER BY t.created_at DESC
  `,
    [parentId]
  );
  return result.rows;
}

app.get("/forum", async (req, res) => {
  if (!req.session.username) {
    return res.redirect("/");
  }

  try {
    const categoriesRes = await db.query(
      `SELECT * FROM categories ORDER BY id`
    );
    const categories = categoriesRes.rows;

    const threads = await getThreadsHierarchy();

    const permissions = await getUserPermissions(req.session.username);

    res.render("forum.ejs", {
      categories,
      threads,
      details: { username: req.session.username },
      selectedCategory: null,
      isAdmin: permissions.isAdmin,
      canCreateMainThreads: permissions.canCreateMainThreads,
    });
  } catch (err) {
    console.error(err);
    res.render("forum.ejs", {
      categories: [],
      threads: [],
      details: { username: req.session.username },
      selectedCategory: null,
      isAdmin: false,
      canCreateMainThreads: false,
      error: "Hiba történt a fórum betöltésekor.",
    });
  }
});

app.get("/forum/category/:id", async (req, res) => {
  if (!req.session.username) {
    return res.redirect("/");
  }

  const categoryId = req.params.id;
  try {
    const categoriesRes = await db.query(
      `SELECT * FROM categories ORDER BY id`
    );
    const categories = categoriesRes.rows;

    const threads = await getThreadsHierarchy(categoryId);

    const permissions = await getUserPermissions(req.session.username);

    res.render("forum.ejs", {
      categories,
      threads,
      details: { username: req.session.username },
      selectedCategory: categoryId,
      isAdmin: permissions.isAdmin,
      canCreateMainThreads: permissions.canCreateMainThreads,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/forum");
  }
});

app.post("/create-main-thread", checkMainThreadPermission, async (req, res) => {
  const { title, description, categoryId } = req.body;

  if (!title || !description || !categoryId) {
    return res.status(400).json({ error: "Minden mező kötelező" });
  }

  try {
    const result = await db.query(
      "INSERT INTO threads (title, description, category_id, parent_id, author, level) VALUES ($1, $2, $3, NULL, $4, 0) RETURNING id",
      [title, description, categoryId, req.session.username]
    );

    res.json({ success: true, threadId: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hiba történt a téma létrehozásakor" });
  }
});

app.post("/create-thread", async (req, res) => {
  const { title, description, categoryId, parentId } = req.body;

  if (!req.session.username) {
    return res.redirect("/");
  }

  try {
    let level = 0;
    let finalCategoryId = categoryId;

    if (parentId) {
      const parentRes = await db.query(
        "SELECT level, category_id FROM threads WHERE id = $1",
        [parentId]
      );
      if (parentRes.rows.length > 0) {
        level = parentRes.rows[0].level + 1;
        finalCategoryId = parentRes.rows[0].category_id;
      }
    }

    await db.query(
      "INSERT INTO threads (title, description, category_id, parent_id, author, level) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        title,
        description,
        finalCategoryId,
        parentId || null,
        req.session.username,
        level,
      ]
    );

    if (parentId) {
      res.redirect(`/thread/${parentId}`);
    } else {
      res.redirect("/forum");
    }
  } catch (err) {
    console.error(err);
    res.redirect("/forum");
  }
});

app.delete("/delete-thread/:id", async (req, res) => {
  const threadId = req.params.id;

  if (!req.session.username) {
    return res
      .status(403)
      .json({ error: "Nincs jogosultságod ehhez a művelethez" });
  }

  try {
    const permissions = await getUserPermissions(req.session.username);

    if (!permissions.isAdmin && !permissions.canCreateMainThreads) {
      return res
        .status(403)
        .json({ error: "Nincs jogosultságod témák törléséhez" });
    }

    await deleteThreadRecursively(threadId);

    res.json({ success: true });
  } catch (err) {
    console.error("Hiba a téma törlésénél:", err);
    res.status(500).json({ error: "Hiba történt a téma törlésénél" });
  }
});

async function deleteThreadRecursively(threadId) {
  const subthreadsRes = await db.query(
    "SELECT id FROM threads WHERE parent_id = $1",
    [threadId]
  );

  for (const subthread of subthreadsRes.rows) {
    await deleteThreadRecursively(subthread.id);
  }

  await db.query("DELETE FROM threads WHERE id = $1", [threadId]);
}

app.get("/thread/:id", async (req, res) => {
  const threadId = req.params.id;

  try {
    const threadRes = await db.query(
      `
      SELECT t.*, c.name as category_name 
      FROM threads t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = $1
    `,
      [threadId]
    );

    if (threadRes.rows.length === 0) {
      return res.redirect("/forum");
    }

    const thread = threadRes.rows[0];
    const subthreads = await getSubthreads(threadId);

    const permissions = await getUserPermissions(req.session.username);

    res.render("thread.ejs", {
      thread,
      subthreads,
      details: { username: req.session.username },
      isAdmin: permissions.isAdmin,
      canCreateMainThreads: permissions.canCreateMainThreads,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/forum");
  }
});

app.post(
  "/set-main-thread-permission/:userId",
  checkForumAdminPermission,
  async (req, res) => {
    const targetUserId = req.params.userId;
    const { canCreateMainThreads } = req.body;

    try {
      await db.query(
        "UPDATE users SET can_create_main_threads = $1 WHERE id = $2",
        [canCreateMainThreads ? true : false, targetUserId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Hiba a jogosultság beállításánál:", err);
      res.status(500).json({ error: "Hiba történt" });
    }
  }
);

app.post(
  "/set-forum-admin/:userId",
  checkForumAdminPermission,
  async (req, res) => {
    const targetUserId = req.params.userId;
    const { isAdmin } = req.body;

    try {
      await db.query("UPDATE users SET is_forum_admin = $1 WHERE id = $2", [
        isAdmin ? true : false,
        targetUserId,
      ]);

      res.json({ success: true });
    } catch (err) {
      console.error("Hiba az admin jog beállításánál:", err);
      res.status(500).json({ error: "Hiba történt" });
    }
  }
);

app.get("/admin/users", checkForumAdminPermission, async (req, res) => {
  try {
    const usersRes = await db.query(
      "SELECT id, username, email, is_forum_admin, can_create_main_threads, created_at FROM users ORDER BY username"
    );

    res.render("admin-users.ejs", {
      users: usersRes.rows,
      details: { username: req.session.username },
    });
  } catch (err) {
    console.error("Adatbázis hiba:", err);
    res.status(500).send("Szerver hiba");
  }
});

app.get("/profile", async (req, res) => {
  if (!req.session.username) {
    return res.redirect("/");
  }

  try {
    const userRes = await db.query(
      "SELECT id, username, email, created_at FROM users WHERE username = $1",
      [req.session.username]
    );

    if (userRes.rows.length === 0) {
      return res.redirect("/");
    }

    const user = userRes.rows[0];

    const threadCountRes = await db.query(
      "SELECT COUNT(*) as count FROM threads WHERE author = $1",
      [req.session.username]
    );

    const threadCount = threadCountRes.rows[0].count;

    res.render("profile.ejs", {
      user,
      threadCount,
      details: { username: req.session.username },
      success: null,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/forum");
  }
});

app.post("/profile/update", async (req, res) => {
  if (!req.session.username) {
    return res.redirect("/");
  }

  const { newUsername, newEmail, currentPassword, newPassword } = req.body;

  try {
    const userRes = await db.query("SELECT * FROM users WHERE username = $1", [
      req.session.username,
    ]);

    if (userRes.rows.length === 0) {
      return res.redirect("/");
    }

    const user = userRes.rows[0];

    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );
    if (!passwordMatch) {
      const threadCountRes = await db.query(
        "SELECT COUNT(*) as count FROM threads WHERE author = $1",
        [req.session.username]
      );
      const threadCount = threadCountRes.rows[0].count;

      return res.render("profile.ejs", {
        user,
        threadCount,
        details: { username: req.session.username },
        error: "Hibás jelenlegi jelszó.",
        success: null,
      });
    }

    if (newUsername !== user.username) {
      const existingUserRes = await db.query(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [newUsername, user.id]
      );

      if (existingUserRes.rows.length > 0) {
        const threadCountRes = await db.query(
          "SELECT COUNT(*) as count FROM threads WHERE author = $1",
          [req.session.username]
        );
        const threadCount = threadCountRes.rows[0].count;

        return res.render("profile.ejs", {
          user,
          threadCount,
          details: { username: req.session.username },
          error: "Ez a felhasználónév már foglalt.",
          success: null,
        });
      }
    }

    if (newEmail !== user.email) {
      const existingEmailRes = await db.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [newEmail, user.id]
      );

      if (existingEmailRes.rows.length > 0) {
        const threadCountRes = await db.query(
          "SELECT COUNT(*) as count FROM threads WHERE author = $1",
          [req.session.username]
        );
        const threadCount = threadCountRes.rows[0].count;

        return res.render("profile.ejs", {
          user,
          threadCount,
          details: { username: req.session.username },
          error: "Ez az email cím már használatban van.",
          success: null,
        });
      }
    }

    let hashedPassword = user.password_hash;
    if (newPassword && newPassword.trim() !== "") {
      hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    }

    await db.query(
      "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
      [newUsername, newEmail, hashedPassword, user.id]
    );

    if (newUsername !== user.username) {
      await db.query("UPDATE threads SET author = $1 WHERE author = $2", [
        newUsername,
        user.username,
      ]);
      req.session.username = newUsername;
    }

    const updatedUserRes = await db.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [user.id]
    );

    const updatedUser = updatedUserRes.rows[0];

    const threadCountRes = await db.query(
      "SELECT COUNT(*) as count FROM threads WHERE author = $1",
      [updatedUser.username]
    );

    const threadCount = threadCountRes.rows[0].count;

    res.render("profile.ejs", {
      user: updatedUser,
      threadCount,
      details: { username: req.session.username },
      success: "Profil sikeresen frissítve!",
      error: null,
    });
  } catch (err) {
    console.error(err);
    const threadCountRes = await db.query(
      "SELECT COUNT(*) as count FROM threads WHERE author = $1",
      [req.session.username]
    );
    const threadCount = threadCountRes.rows[0].count;

    const userRes = await db.query(
      "SELECT id, username, email, created_at FROM users WHERE username = $1",
      [req.session.username]
    );

    res.render("profile.ejs", {
      user: userRes.rows[0],
      threadCount,
      details: { username: req.session.username },
      error: "Hiba történt a profil frissítésekor.",
      success: null,
    });
  }
});

app.get("/pp", (req, res) => {
  res.render("pp.ejs", {
    details: { username: req.session.username },
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Hiba történt a kijelentkezés során:", err);
      return res.redirect("/forum");
    }
    res.redirect("/");
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Hiba történt a kijelentkezés során:", err);
      return res.redirect("/forum");
    }
    res.redirect("/");
  });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});
