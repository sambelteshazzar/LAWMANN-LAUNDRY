CREATE TABLE "condition_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"note" text NOT NULL,
	"image" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "condition_photo" ADD CONSTRAINT "condition_photo_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_photo" ADD CONSTRAINT "condition_photo_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "condition_photo_order" ON "condition_photo" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_item_order" ON "order_item" USING btree ("order_id","position");