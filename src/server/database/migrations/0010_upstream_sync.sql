ALTER TABLE `clients_table` ADD `content_padding_addition` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `rekey_after_time` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `rekey_timeout` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `reject_after_time` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `keepalive_timeout` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `max_handshake_attempts` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `disable_cookies` integer;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `header_protection_key` text;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `content_padding_addition` text;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `rekey_after_time` text;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `rekey_timeout` text;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `reject_after_time` text;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `keepalive_timeout` text;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `max_handshake_attempts` text;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `random_trailers` integer;--> statement-breakpoint
ALTER TABLE `interfaces_table` ADD `disable_cookies` integer;
--> statement-breakpoint
UPDATE `hooks_table` SET
  `pre_up` = replace(`pre_up`, 'wg0', '{{interface}}'),
  `post_up` = replace(`post_up`, 'wg0', '{{interface}}'),
  `pre_down` = replace(`pre_down`, 'wg0', '{{interface}}'),
  `post_down` = replace(`post_down`, 'wg0', '{{interface}}');