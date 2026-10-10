CREATE TYPE "public"."correction_field" AS ENUM('weight', 'price', 'student', 'location', 'promised_date');--> statement-breakpoint
ALTER TYPE "public"."sms_kind" ADD VALUE 'corrected';--> statement-breakpoint
CREATE TABLE "order_correction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"field" "correction_field" NOT NULL,
	"from_value" text NOT NULL,
	"to_value" text NOT NULL,
	"note" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_correction" ADD CONSTRAINT "order_correction_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_correction" ADD CONSTRAINT "order_correction_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_correction_order" ON "order_correction" USING btree ("order_id","at");