output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "ecs_task_public_ip" {
  value = try(data.aws_ecs_task.first[0].attachments[0].details[index(data.aws_ecs_task.first[0].attachments[0].details[*].name, "publicIPv4Address")].value, null)
}

