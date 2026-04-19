import threading
import socket
import sys
from random import seed
from random import randint
from datetime import datetime
import time


PORT = 5050
SERVER = "127.0.0.1"
#SERVER="192.168.4.32"
ADDR = (SERVER, PORT)
FORMAT = "utf-8"
DISCONNECT_MESSAGE = "!DISCONNECT"
clientKey=0
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind(ADDR)
clients = dict()
clients_lock = threading.Lock()
r2=[]
score=dict()
Foxes=9
n=25
hits=0
misses=0
all_scores=dict()

def gen_foxes():
    seed(int(datetime.utcnow().timestamp()))
    for i in range(Foxes):
        r2.append([randint(0,n-1),randint(0,n-1)])
        
def parse_string(string):
    pairs = string.split(",")
    name_value_pairs = {}
    for pair in pairs:
        name, value = pair.split(":")
        name_value_pairs[name] = int(value) 
    return name_value_pairs

def calc_winner(score):
    for key, value in score.items():
        print(key,value)
        t_score=10*value["hits"]+(n-value["drone count"])
        all_scores[key]=t_score
    return dict(sorted(all_scores.items(), key=lambda item: item[1],reverse=True))
        
def handle_client(conn, addr):
    score_str="SCORE"
    sortScore=dict()
    try:
        connected = True
        while connected:
            msg = conn.recv(1024).decode(FORMAT)
            if not msg:
                break
            if msg == "send foxes":
                str1="INITIATE;" + str(r2)
                clients[addr].send(str(str1).encode(FORMAT))
                sys.stdout.flush()
            else:
                print(addr,msg)
                score[addr]=parse_string(msg)
                print(len(score))
                print(score[addr])
                print(threading.active_count()-1)
            if len(score)==threading.active_count()-1:
                print("Game Over")
                print(calc_winner(score))
                for key, value in calc_winner(score).items():
                    print(str(key),str(value))
                    score_str=score_str + ";" + str(key)+ ":" + str(value) 
                for key, value in clients.items():
                   clients[key].send((score_str).encode(FORMAT))
                
            #sys.stdout.flush()
    finally:
        with clients_lock:
            clients.pop(addr)
            sys.stdout.write("\nClient count is : " + str(threading.active_count()-1))
        conn.close()

def start():
    global clientKey
    print('SERVER STARTED')
    sys.stdout.flush()
    server.listen(5)
    while True:
        sys.stdout.flush()
        conn, addr = server.accept()
        print(conn.getsockname())
        print(addr)
        sys.stdout.flush()
        with clients_lock:
            clients[addr]=conn
            clientKey+=1
            sys.stdout.write(str(clients.keys())+'\n')
        thread = threading.Thread(target=handle_client, args=(conn, addr))
        thread.start()
        print("\nClient count is : " + str(threading.active_count()-1))
        
gen_foxes()  
print(r2)   
start()
print("After start")