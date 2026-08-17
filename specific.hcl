service "backoffice" {
  image = "node:18"
  command = ["npm", "start"]
  
  volume "data" {
    mount_path = "/app/data"
    size = "5Gi"
  }
}
