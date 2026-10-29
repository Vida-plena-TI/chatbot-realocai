"""Create the group allowed to see report blocks with patient data.

The name is copied here (not imported from chat.services.sensitive) so the migration
keeps working if that module changes. No user is added: an administrator assigns them.
"""

from django.db import migrations

PATIENT_REPORTS_GROUP = "coordenacao"


def create_group(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.get_or_create(name=PATIENT_REPORTS_GROUP)


class Migration(migrations.Migration):
    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("chat", "0004_conversation_preview_processing_message_blocos"),
    ]

    # Reversing keeps the group: it may already have members.
    operations = [migrations.RunPython(create_group, migrations.RunPython.noop)]
