build "app" {
  dockerfile = "Dockerfile"
}

service "backoffice" {
  build = build.app
  command = "node src/server.js"

  endpoint {
    public = true
  }

  env = {
    PORT = port
  }

  volume "data" {}
}
