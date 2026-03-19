CREATE TABLE avatars (
  avatar_id TEXT PRIMARY KEY,
  owner_type TEXT,
  owner_id TEXT,
  kind TEXT,
  name TEXT,
  image_url TEXT,
  preview_url TEXT,
  voice_profile_id TEXT,
  motion_profile_id TEXT,
  style_profile_id TEXT,
  gender_hint TEXT,
  age_hint INTEGER,
  language_default TEXT,
  is_active INTEGER,
  is_public INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  selected_avatar_id TEXT,
  mirror_avatar_id TEXT,
  preferred_voice_profile_id TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  agent_name TEXT,
  role TEXT,
  avatar_id TEXT,
  voice_profile_id TEXT,
  motion_profile_id TEXT,
  personality_profile TEXT,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE avatar_renders (
  render_id TEXT PRIMARY KEY,
  avatar_id TEXT,
  user_id TEXT,
  agent_id TEXT,
  input_text TEXT,
  input_audio_url TEXT,
  output_video_url TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);
