import { Router } from 'express';
import { exchangeActivityCode } from '../auth/discordActivity.js';
import { fetchDiscordProfile, avatarUrl } from '../auth/discord.js';
import { signToken } from '../auth/jwt.js';
import { pool } from '../db.js';
import { makeLogger } from '../lib/logger.js';

const router = Router();
const log = makeLogger('discordActivity');
router.post('/token', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'code kosong' });

    const tokens = await exchangeActivityCode(code);
    const profile = await fetchDiscordProfile(tokens.access_token);
    await pool.query(
      `INSERT INTO users (discord_id, username, avatar, last_login)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         avatar = VALUES(avatar),
         last_login = NOW()`,
      [profile.id, profile.username, avatarUrl(profile)]
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE discord_id = ?', [profile.id]);
    const user = rows[0];
    if (!user) return res.status(500).json({ error: 'user tidak ditemukan' });

    res.json({
      access_token: tokens.access_token,
      token: signToken(user),
      user: { id: user.id, username: user.username, avatar: user.avatar, email: user.email },
    });
  } catch (err) {
    log.error('gagal proses request:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;