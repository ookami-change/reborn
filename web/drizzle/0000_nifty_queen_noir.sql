CREATE TABLE "attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"capture_id" uuid,
	"child_answer" text,
	"verdict" text NOT NULL,
	"source" text NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"source_type" text NOT NULL,
	"review_sheet_id" uuid,
	"marked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"grade" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mistake_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"box_level" integer DEFAULT 1 NOT NULL,
	"next_due_date" date,
	"consecutive_correct" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'learning' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mistake_card_problem_id_unique" UNIQUE("problem_id")
);
--> statement-breakpoint
CREATE TABLE "problem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"source_capture_id" uuid NOT NULL,
	"crop_box" jsonb NOT NULL,
	"crop_image_key" text NOT NULL,
	"mask_boxes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct_answer" text NOT NULL,
	"stem_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_sheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"short_code" text NOT NULL,
	"item_order" jsonb NOT NULL,
	"per_page" integer DEFAULT 5 NOT NULL,
	"with_answer_page" boolean DEFAULT true NOT NULL,
	"pdf_key" text,
	"status" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_card" ADD CONSTRAINT "mistake_card_problem_id_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_card" ADD CONSTRAINT "mistake_card_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_source_capture_id_capture_id_fk" FOREIGN KEY ("source_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sheet" ADD CONSTRAINT "review_sheet_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_problem_idx" ON "attempt" USING btree ("problem_id","created_at");--> statement-breakpoint
CREATE INDEX "capture_pending_idx" ON "capture" USING btree ("child_id","marked","created_at");--> statement-breakpoint
CREATE INDEX "card_due_idx" ON "mistake_card" USING btree ("child_id","status","next_due_date");--> statement-breakpoint
CREATE INDEX "problem_child_idx" ON "problem" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_code_idx" ON "review_sheet" USING btree ("short_code");