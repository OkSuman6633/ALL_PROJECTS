provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix = "${var.environment}-aod"
  labels = {
    app         = "ai-operations-diagnostic"
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "storage.googleapis.com",
    "bigquery.googleapis.com",
    "secretmanager.googleapis.com",
    "iamcredentials.googleapis.com",
    "artifactregistry.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "aiplatform.googleapis.com"
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "source" {
  name                        = "${var.project_id}-${local.prefix}-input"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
  lifecycle_rule {
    condition { age = 90 }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket" "state" {
  name                        = "${var.project_id}-${local.prefix}-state"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket" "reports" {
  name                        = "${var.project_id}-${local.prefix}-reports"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
  lifecycle_rule {
    condition { age = 90 }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.apis]
}

resource "google_bigquery_dataset" "analytics" {
  dataset_id                 = "aod_analytics_${var.environment}"
  location                   = var.region
  delete_contents_on_destroy = false
  labels                     = local.labels
  depends_on                 = [google_project_service.apis]
}

resource "google_cloud_tasks_queue" "diagnostics" {
  name     = "${local.prefix}-diagnostics"
  location = var.region
  rate_limits {
    max_dispatches_per_second = 2
    max_concurrent_dispatches = 5
  }
  retry_config {
    max_attempts       = 5
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 3
  }
  depends_on = [google_project_service.apis]
}

output "source_bucket" {
  value = google_storage_bucket.source.name
}
output "state_bucket" {
  value = google_storage_bucket.state.name
}
output "report_bucket" {
  value = google_storage_bucket.reports.name
}
output "analytics_dataset" {
  value = google_bigquery_dataset.analytics.dataset_id
}
output "queue_name" {
  value = google_cloud_tasks_queue.diagnostics.name
}
