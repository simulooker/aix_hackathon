from app.services.environment_service import weather_alerts


def test_vulnerable_user_gets_heat_warning_earlier() -> None:
    alerts = weather_alerts(31, 31, 0, 0, "elderly")

    assert any(alert.title == "폭염 주의" for alert in alerts)


def test_rain_and_snow_create_separate_warnings() -> None:
    alerts = weather_alerts(2, 0, 2.5, 0.5, "wheelchair")
    titles = {alert.title for alert in alerts}

    assert "우천 주의" in titles
    assert "적설·결빙 주의" in titles
