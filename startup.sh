#!/usr/bin/env sh

log() {
  printf "[%s] %s\n" "$1" "$2"
}

info() {
  log "INFO" "$1"
}

error() {
  log "ERROR" "$1"
}

migrate() {
  info 'Performing migrations with "Ketbin.Release.migrate()"'
  bin/ketbin eval "Ketbin.Release.migrate()"

  LAST_EXIT=$?
  if [ $LAST_EXIT = 0 ]; then 
    info 'Done performing migrations'
  else
    error "Unable to perform migrations, exit code $LAST_EXIT"
    exit $LAST_EXIT
  fi
}

start() {
  info 'Starting the application'
  bin/ketbin start
}

SLEEP_TIME=10
info "Sleeping for $SLEEP_TIME seconds for all services to be up"
sleep $SLEEP_TIME

migrate
start