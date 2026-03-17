output "aws_role_to_assume" {
  value       = aws_iam_role.gha.arn
  description = "Set this as GitHub Secret AWS_ROLE_TO_ASSUME"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "ECR repository URL used by GitHub Actions"
}

