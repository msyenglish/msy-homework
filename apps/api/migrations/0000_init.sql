CREATE TABLE `ai_key_usage` (
	`key_id` text PRIMARY KEY NOT NULL,
	`last_used_at` text,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`cooldown_until` text,
	`provider` text
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`task` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`key_id` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`ok` integer DEFAULT true NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_task_idx` ON `ai_usage` (`task`);--> statement-breakpoint
CREATE TABLE `assignment_unlocks` (
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`unlocked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `exercise_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`student_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`teacher_note` text,
	`assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`student_id`, `exercise_id`),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `class_assignments` (
	`class_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`teacher_note` text,
	`position` integer,
	`assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`class_id`, `exercise_id`),
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `class_members` (
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`class_id`, `user_id`),
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `class_members_user_idx` ON `class_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`join_code` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_join_code_unique` ON `classes` (`join_code`);--> statement-breakpoint
CREATE TABLE `email_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`old_email` text NOT NULL,
	`new_email` text NOT NULL,
	`source` text NOT NULL,
	`effective_at` text NOT NULL,
	`applied_at` text,
	`canceled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_changes_user_idx` ON `email_changes` (`user_id`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`title` text NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`skill` text,
	`level` text,
	`tags` text,
	`passage` text,
	`passage_ipa` text,
	`audio_url` text,
	`audio_script` text,
	`audio_voice` text,
	`audio_cues` text,
	`dictation_mode` text,
	`translate_level` text,
	`read_aloud` integer DEFAULT false NOT NULL,
	`wordlist` text,
	`vocab_deck` text,
	`media_source` text,
	`video` integer DEFAULT false NOT NULL,
	`youtube_id` text,
	`video_lang` text,
	`video_segments` text,
	`video_modes` text,
	`speaking_prompt` text,
	`speaking_framework` text,
	`speaking_sample` text,
	`speaking_image` text,
	`image` text,
	`template_id` text,
	`gen_config` text,
	`path_order` integer,
	`stage_id` text,
	`topic_id` text,
	`tag_id` text,
	`layer` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`stage_id`) REFERENCES `path_stages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_exercise_id_unique` ON `exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `game_scores` (
	`user_id` text PRIMARY KEY NOT NULL,
	`best` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `gen_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`kind` text DEFAULT 'quiz' NOT NULL,
	`template` text,
	`grammar_ids` text,
	`gen_config` text,
	`overwrite_id` text,
	`prompt` text NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`assign_ids` text,
	`tag_id` text,
	`topic_id` text,
	`layer` text,
	`title` text,
	`exercise_id` text,
	`error` text,
	`dropped` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gen_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grammar` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`cefr` text NOT NULL,
	`summary` text NOT NULL,
	`forms` text NOT NULL,
	`signals` text,
	`usage` text NOT NULL,
	`spelling` text,
	`examples` text NOT NULL,
	`mistakes` text,
	`tips` text,
	`compare` text,
	`related` text,
	`keywords` text,
	`bank` text,
	`drill_types` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `grammar_cefr_idx` ON `grammar` (`cefr`,`position`);--> statement-breakpoint
CREATE TABLE `grammar_items` (
	`id` text PRIMARY KEY NOT NULL,
	`grammar_id` text NOT NULL,
	`cefr` text NOT NULL,
	`tier` integer DEFAULT 1 NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`explain_vi` text,
	`topic_id` text,
	`status` text DEFAULT 'live' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`question_id` text,
	`seen_count` integer DEFAULT 0 NOT NULL,
	`wrong_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`grammar_id`) REFERENCES `grammar`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grammar_items_pick_idx` ON `grammar_items` (`grammar_id`,`status`,`tier`);--> statement-breakpoint
CREATE UNIQUE INDEX `grammar_items_question_unq` ON `grammar_items` (`question_id`);--> statement-breakpoint
CREATE TABLE `grammar_practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`mode` text DEFAULT 'auto' NOT NULL,
	`level` text,
	`grammar_ids` text NOT NULL,
	`item_ids` text NOT NULL,
	`answers` text NOT NULL,
	`total` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grammar_practice_sessions_user_idx` ON `grammar_practice_sessions` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `grammar_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`grammar_ids` text NOT NULL,
	`mode` text DEFAULT 'all' NOT NULL,
	`correct` real NOT NULL,
	`total` integer NOT NULL,
	`score` integer NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`result` text,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grammar_submissions_user_idx` ON `grammar_submissions` (`user_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `grammar_translate_items` (
	`id` text PRIMARY KEY NOT NULL,
	`grammar_id` text NOT NULL,
	`cefr` text NOT NULL,
	`tier` integer DEFAULT 1 NOT NULL,
	`vi` text NOT NULL,
	`en` text NOT NULL,
	`accept` text,
	`word_bank` text,
	`note_vi` text,
	`article_lenient` integer DEFAULT 1 NOT NULL,
	`source_item_id` text,
	`pattern_id` text,
	`slots` text,
	`status` text DEFAULT 'live' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`seen_count` integer DEFAULT 0 NOT NULL,
	`wrong_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`grammar_id`) REFERENCES `grammar`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grammar_translate_items_pick_idx` ON `grammar_translate_items` (`grammar_id`,`status`,`tier`);--> statement-breakpoint
CREATE TABLE `levels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#06b6d4' NOT NULL,
	`icon` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_titles` (
	`key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_idx` ON `password_resets` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_resets_user_idx` ON `password_resets` (`user_id`);--> statement-breakpoint
CREATE TABLE `path_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`level_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `practice_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`answered` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_drafts_user_ex_kind_unq` ON `practice_drafts` (`user_id`,`exercise_id`,`kind`);--> statement-breakpoint
CREATE INDEX `practice_drafts_user_idx` ON `practice_drafts` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`question` text NOT NULL,
	`options` text,
	`answer` text,
	`accept` text,
	`word_bank` text,
	`image` text,
	`explanation` text,
	`hint` text,
	`pairs` text,
	`tokens` text,
	`categories` text,
	`items` text,
	`article_lenient` integer,
	`grammar_id` text,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grammar_id`) REFERENCES `grammar`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `questions_exercise_idx` ON `questions` (`exercise_id`,`position`);--> statement-breakpoint
CREATE TABLE `reading_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`exercise_id` text NOT NULL,
	`student_id` text,
	`user_id` text,
	`audio_key` text NOT NULL,
	`content_type` text NOT NULL,
	`browser_segments` text,
	`with_feedback` integer DEFAULT true NOT NULL,
	`submission_id` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_jobs_student_idx` ON `reading_jobs` (`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reading_jobs_user_idx` ON `reading_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reading_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`student_id` text,
	`user_id` text,
	`audio_key` text NOT NULL,
	`pron_score` integer NOT NULL,
	`points` integer,
	`accuracy` integer NOT NULL,
	`fluency` integer NOT NULL,
	`completeness` integer NOT NULL,
	`prosody` integer,
	`transcript` text,
	`words` text NOT NULL,
	`error_words` text,
	`ai_feedback` text,
	`teacher_feedback` text,
	`feedback_grammar` text,
	`duration_ms` integer,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reading_submissions_user_submitted_idx` ON `reading_submissions` (`user_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text,
	`user_id` text,
	`month` text NOT NULL,
	`content` text NOT NULL,
	`stats` text,
	`slug` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_student_month` ON `reports` (`student_id`,`month`);--> statement-breakpoint
CREATE UNIQUE INDEX `reports_user_month` ON `reports` (`user_id`,`month`);--> statement-breakpoint
CREATE UNIQUE INDEX `reports_slug` ON `reports` (`slug`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`passcode` text,
	`contact` text,
	`note` text,
	`birth_year` integer,
	`gender` text,
	`level_id` text,
	`active` integer DEFAULT true NOT NULL,
	`user_id` text,
	`reader_prefs` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_passcode_unique` ON `students` (`passcode`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`student_id` text,
	`user_id` text,
	`score` integer NOT NULL,
	`total` integer NOT NULL,
	`answers` text NOT NULL,
	`details` text NOT NULL,
	`teacher_feedback` text,
	`feedback_skipped` integer DEFAULT 0 NOT NULL,
	`feedback_status` text,
	`feedback_grammar` text,
	`hint_used` integer DEFAULT false NOT NULL,
	`hint_positions` text,
	`points` integer,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submissions_user_submitted_idx` ON `submissions` (`user_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `submissions_exercise_idx` ON `submissions` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#06b6d4' NOT NULL,
	`icon` text,
	`scope` text DEFAULT 'all' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`sessions_valid_from` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teachers_email_unique` ON `teachers` (`email`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#06b6d4' NOT NULL,
	`icon` text,
	`parent_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_assignments` (
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`teacher_note` text,
	`position` integer,
	`assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `exercise_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_assignments_exercise_idx` ON `user_assignments` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `user_grammar_items` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`cleared_at` text,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`wrongs` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `grammar_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_grammar_items_seen_idx` ON `user_grammar_items` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `user_grammar_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`grammar_id` text NOT NULL,
	`learned` integer DEFAULT false NOT NULL,
	`learned_at` text,
	`marked` integer DEFAULT false NOT NULL,
	`marked_at` text,
	`stability` real,
	`difficulty` real,
	`due_at` text,
	`last_review_at` text,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`tier` integer DEFAULT 0 NOT NULL,
	`last_rating` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grammar_id`) REFERENCES `grammar`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_grammar_progress_user_grammar_unq` ON `user_grammar_progress` (`user_id`,`grammar_id`);--> statement-breakpoint
CREATE INDEX `user_grammar_progress_due_idx` ON `user_grammar_progress` (`user_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `user_grammar_translate_items` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`cleared_at` text,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`wrongs` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `grammar_translate_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_grammar_translate_items_seen_idx` ON `user_grammar_translate_items` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `user_level_progress` (
	`user_id` text NOT NULL,
	`level_id` text NOT NULL,
	`unlocked_count` integer DEFAULT 0 NOT NULL,
	`unlocked_today` integer DEFAULT 0 NOT NULL,
	`last_unlock_date` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `level_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_study_time` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`area` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `date`, `area`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_vocab_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`word` text NOT NULL,
	`learned` integer DEFAULT false NOT NULL,
	`learned_at` text,
	`pron_best` integer,
	`pron_attempts` integer DEFAULT 0 NOT NULL,
	`last_pron_at` text,
	`miss_count` integer DEFAULT 0 NOT NULL,
	`last_wrong_at` text,
	`stability` real,
	`difficulty` real,
	`due_at` text,
	`last_review_at` text,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`tier` integer DEFAULT 0 NOT NULL,
	`tier_max` integer DEFAULT 0 NOT NULL,
	`learned_source` text,
	`last_rating` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_vocab_progress_user_word_unq` ON `user_vocab_progress` (`user_id`,`word`);--> statement-breakpoint
CREATE INDEX `user_vocab_progress_user_due_idx` ON `user_vocab_progress` (`user_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`google_sub` text,
	`provider` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`level_id` text,
	`topics` text,
	`birth_year` integer,
	`gender` text,
	`academic_enabled` integer DEFAULT false NOT NULL,
	`voice_gender` text,
	`voice_gender_sentence` text,
	`library_view` text,
	`theme` text,
	`active` integer DEFAULT true NOT NULL,
	`anonymous` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text,
	`sessions_valid_from` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE TABLE `video_dictation_scores` (
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`segment` integer NOT NULL,
	`first_ok` integer DEFAULT false NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`hints` integer DEFAULT 0 NOT NULL,
	`revealed` integer DEFAULT false NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`level` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `exercise_id`, `segment`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `video_shadow_scores` (
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`segment` integer NOT NULL,
	`score` integer NOT NULL,
	`detail` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `exercise_id`, `segment`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `video_transcripts` (
	`youtube_id` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`cues` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`youtube_id`, `lang`)
);
--> statement-breakpoint
CREATE TABLE `vocab_items` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text,
	`user_id` text,
	`word` text NOT NULL,
	`word_key` text NOT NULL,
	`pos` text,
	`ipa` text,
	`meaning` text,
	`example` text,
	`synonyms` text,
	`image` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `vocab_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_items_set_idx` ON `vocab_items` (`set_id`,`position`);--> statement-breakpoint
CREATE INDEX `vocab_items_user_idx` ON `vocab_items` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_items_user_word_unq` ON `vocab_items` (`user_id`,`word_key`);--> statement-breakpoint
CREATE TABLE `vocab_practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_key` text,
	`label` text NOT NULL,
	`config` text NOT NULL,
	`item_ids` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_practice_sessions_user_idx` ON `vocab_practice_sessions` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `vocab_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`level_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`teacher_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_sets_slug_unq` ON `vocab_sets` (`slug`);--> statement-breakpoint
CREATE INDEX `vocab_sets_level_idx` ON `vocab_sets` (`level_id`);--> statement-breakpoint
CREATE TABLE `vocab_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text,
	`student_id` text,
	`user_id` text,
	`score` integer NOT NULL,
	`total` integer NOT NULL,
	`result` text NOT NULL,
	`points` integer,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `vocab_submissions_exercise_idx` ON `vocab_submissions` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `vocab_submissions_user_idx` ON `vocab_submissions` (`user_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `writing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`exercise_id` text NOT NULL,
	`student_id` text,
	`user_id` text,
	`text` text NOT NULL,
	`submission_id` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `writing_jobs_student_idx` ON `writing_jobs` (`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `writing_jobs_user_idx` ON `writing_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `writing_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`student_id` text,
	`user_id` text,
	`text` text NOT NULL,
	`word_count` integer NOT NULL,
	`overall_score` integer NOT NULL,
	`task_band` integer,
	`coherence_band` integer,
	`grammar_band` integer,
	`lexical_band` integer,
	`analysis` text,
	`ai_feedback` text,
	`teacher_feedback` text,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `writing_submissions_user_submitted_idx` ON `writing_submissions` (`user_id`,`submitted_at`);