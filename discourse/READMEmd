`docker exec -it discourse_app /bin/bash -c "cd /var/www/discourse && RAILS_ENV=production bundle exec rake admin:create"`


`docker exec -it discourse_app /bin/bash -c "git config --global --add safe.directory /var/www/discourse && cd /var/www/discourse && RAILS_ENV=production bundle exec rake assets:precompile"`

`docker-compose restart discourse`
