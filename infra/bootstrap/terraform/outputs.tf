output "aws_role_to_assume" {
  value       = aws_iam_role.gha.arn
  description = "Set this as GitHub Secret AWS_ROLE_TO_ASSUME"
}

