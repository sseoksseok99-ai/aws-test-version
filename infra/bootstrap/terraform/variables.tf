variable "region" {
  type        = string
  description = "AWS region"
}

variable "github_owner" {
  type        = string
  description = "GitHub org/user name"
  default     = "sseoksseok99-ai"
}

variable "github_repo" {
  type        = string
  description = "GitHub repo name"
  default     = "aws-test-version"
}

variable "github_ref" {
  type        = string
  description = "Allowed ref. Example: refs/heads/main"
  default     = "refs/heads/main"
}

variable "role_name" {
  type        = string
  description = "IAM role name assumed by GitHub Actions"
  default     = "gha-ecs-terraform-deploy"
}

