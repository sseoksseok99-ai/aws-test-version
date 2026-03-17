variable "region" {
  type        = string
  description = "AWS region"
}

variable "app_name" {
  type        = string
  description = "App name prefix"
  default     = "ecs-minimal-sample"
}

variable "container_port" {
  type        = number
  description = "Container listen port"
  default     = 8080
}

variable "cpu" {
  type        = number
  description = "Fargate CPU units (256=0.25 vCPU)"
  default     = 256
}

variable "memory" {
  type        = number
  description = "Fargate memory (MiB)"
  default     = 512
}

variable "desired_count" {
  type        = number
  description = "Number of tasks"
  default     = 1
}

variable "image_tag" {
  type        = string
  description = "Container image tag (set by GitHub Actions)"
  default     = "latest"
}

