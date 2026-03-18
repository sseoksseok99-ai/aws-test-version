terraform {
  backend "s3" {
    bucket         = "ecs-minimal-sample-tfstate-495801163552"
    key            = "app/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "ecs-minimal-sample-tflock-495801163552"
    encrypt        = true
  }
}

