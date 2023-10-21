import logging
import azure.functions as func
from smtplib import SMTP_SSL as SMTP
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
import pymongo
import requests

with open(".jsonfiles/email.json", "r") as f:
    email_data = json.loads(f.read())
try:
    email_server = SMTP(email_data["server"], email_data["port"])
except:
    email_server = SMTP(email_data["server"], 465)
email_server.login(email_data["user"], email_data["key"])

with open(".jsonfiles/database.json", "r") as f:
    db_data = json.loads(f.read())
db_name = db_data["db_name"]
collection_name = db_data["collection_name"]
client = pymongo.MongoClient(db_data["cosmos_conn_str"])
collection = client[db_name][collection_name]

with open(".jsonfiles/servers.json", "r") as f:
    server_list = json.loads(f.read())

def send_notification_email(subject, content, files: dict={}, to=None, email_server=email_server, sender=email_data["user"]):
    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = sender
    msg.attach(MIMEText(content, "plain", "utf-8"))

    email_server.sendmail(sender, email_data["to"] if to is None else to, msg.as_string())
    logging.info(f"Email sent: {content}")

app = func.FunctionApp()

@app.schedule(schedule="0 0 */2 * * *", arg_name="myTimer", run_on_startup=True,
              use_monitor=False) 
def timed_health_check(myTimer: func.TimerRequest) -> None:
    if myTimer.past_due:
        logging.info('The timer is past due!')

    logging.info('Python timer trigger function executed.')

    failed = [];

    for server_data in server_list:
        try:
            host_name = server_data["host"]
            host_ip = server_data["ip"]
            logging.info(f"trying to connect {host_name} at {host_ip}")
            res = requests.head()
        except:
            pass
