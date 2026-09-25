select cron.schedule(
  'elo-notification-dispatch-v31',
  '* * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name='elo_project_url'
      ) || '/functions/v1/notification-dispatcher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-dispatch-key',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='elo_notification_dispatch_key'
        )
      ),
      body := jsonb_build_object('limit',100),
      timeout_milliseconds := 10000
    );
  $job$
);

