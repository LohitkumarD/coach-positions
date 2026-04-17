from django.urls import path

from ops import views

urlpatterns = [
    path("health/live", views.HealthLiveView.as_view(), name="health-live"),
    path("health/ready", views.HealthReadyView.as_view(), name="health-ready"),
    path("health/metrics", views.MetricsView.as_view(), name="health-metrics"),
    path("api/v1/submissions", views.SubmissionCreateView.as_view(), name="submission-create"),
    path(
        "api/v1/submissions/scan-image",
        views.SubmissionScanImageView.as_view(),
        name="submission-scan-image",
    ),
    path(
        "api/v1/train-services/<int:pk>/recent-sequences",
        views.TrainServiceRecentSequencesView.as_view(),
        name="train-service-recent-sequences",
    ),
    path(
        "api/v1/train-services/<int:pk>/retract-latest-submission",
        views.TrainServiceRetractLatestSubmissionView.as_view(),
        name="train-service-retract-latest",
    ),
    path("api/v1/train-services", views.TrainServiceLookupView.as_view(), name="train-service-lookup"),
    path("api/v1/train-services/create", views.TrainServiceCreateView.as_view(), name="train-service-create"),
    path("api/v1/trains/composition-search", views.TrainCompositionSearchView.as_view(), name="train-composition-search"),
    path("api/v1/board", views.BoardView.as_view(), name="board"),
    path("api/v1/board/stream", views.board_stream_view, name="board-stream"),
    path("api/v1/conflicts", views.ConflictListView.as_view(), name="conflicts"),
    path("api/v1/conflicts/<int:pk>/resolve", views.ConflictResolveView.as_view(), name="conflict-resolve"),
    path("api/v1/conflicts/<int:pk>/override", views.ConflictOverrideView.as_view(), name="conflict-override"),
    path("api/v1/conflicts/<int:pk>/lock", views.ConflictLockView.as_view(), name="conflict-lock"),
    path("api/v1/alerts", views.AlertListView.as_view(), name="alerts"),
    path("api/v1/alerts/<int:pk>/ack", views.AlertAcknowledgeView.as_view(), name="alerts-ack"),
    path("api/v1/decisions/<int:train_service_id>/explain", views.DecisionExplainView.as_view(), name="decision-explain"),
    path("api/v1/contributors/scoreboard", views.ContributorScoreboardView.as_view(), name="contributors-scoreboard"),
    path("api/v1/device-token/register", views.DeviceTokenRegisterView.as_view(), name="device-token-register"),
    path("api/v1/me", views.CurrentUserView.as_view(), name="current-user"),
    path("", views.board_page, name="board-page"),
    path("more", views.more_page, name="more-page"),
    path("submit", views.submit_page, name="submit-page"),
    path("supervisor/conflicts", views.supervisor_page, name="supervisor-page"),
]
