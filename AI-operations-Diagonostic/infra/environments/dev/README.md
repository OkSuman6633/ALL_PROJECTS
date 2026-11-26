# Development environment (Terraform)

This is an initial non-production infrastructure baseline, not a production-ready deployment. It creates private versioned GCS buckets, a BigQuery dataset, required APIs and a bounded Cloud Tasks queue. It does **not** yet deploy Cloud Run services, create complete least-privilege service accounts/IAM bindings, configure GitHub OIDC, budgets/alerts, or wire the API to these services.

1. Create a dedicated Google Cloud project and configure billing deliberately.
2. Authenticate with `gcloud auth application-default login` and verify the active project.
3. Copy `terraform.tfvars.example` to `terraform.tfvars`, set the real project ID, then run `terraform init`, `terraform fmt -check`, `terraform validate`, and `terraform plan`.
4. Have a reviewer inspect the plan. Apply only in a disposable development project after confirming names, location, retention and expected cost.
5. Never use `terraform destroy` against shared or production resources without a reviewed data-retention plan.

Terraform state backend is intentionally not configured here. Before team use, configure a dedicated versioned GCS backend with tightly restricted access and the locking behavior supported by the installed Terraform version.
