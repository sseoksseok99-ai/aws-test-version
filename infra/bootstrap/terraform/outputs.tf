output "aws_role_to_assume" {
  value       = aws_iam_role.gha.arn
  description = "Set this as GitHub Secret AWS_ROLE_TO_ASSUME"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "ECR repository URL used by GitHub Actions"
}

output "tf_state_bucket" {
  value       = aws_s3_bucket.tf_state.bucket
  description = "S3 bucket name for Terraform remote state"
}

output "tf_lock_table" {
  value       = aws_dynamodb_table.tf_lock.name
  description = "DynamoDB table name for Terraform state locking"
}

