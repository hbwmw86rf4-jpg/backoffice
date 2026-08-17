build "app" {
  dockerfile = "Dockerfile"
}

service "backoffice" {
  build = build.app
  command = "node src/server.js"

  endpoint {
    public = true
  }

  volume "data" {}

  env = {
    PORT = port
    DATA_DIR = volume.data.path
    DB_PATH = "${volume.data.path}/backoffice.db"
  }
}
