# Generated manually for IncomingShareImage model

import uuid

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ops", "0006_userprofile_phone_primary"),
    ]

    operations = [
        migrations.CreateModel(
            name="IncomingShareImage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("image_data", models.BinaryField()),
                ("content_type", models.CharField(max_length=128)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={},
        ),
        migrations.AddIndex(
            model_name="incomingshareimage",
            index=models.Index(fields=["created_at"], name="ops_incomin_created_7e8b2d_idx"),
        ),
    ]
