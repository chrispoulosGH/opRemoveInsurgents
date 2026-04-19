# -*- coding: utf-8 -*-
"""
Created on Tue Dec 20 20:48":14 2022
"
@author: chris
"""

from tkinter import *
from random import seed
from random import randint

hits=0
field=[[]]
f1=[]
root = Tk()
n=30
foxes={""}
realrunscolor=dict()
testrunscolor=dict()
entries=dict()
dedup={""}
p=[]
r1=[]
r2=[]
Foxes=9
drones=n
pathList={}
droneCnt=0

def gen_foxes():
    seed()
    for i in range(Foxes):
        r2.append([randint(0,n-1),randint(0,n-1)])
   
    
def check_f(cp):
 
    ret=['0','0','0']
    for i in range(len(r1)):
        if r1[i]==cp[0]:
            ret[0]='1'
        if r1[i]==cp[1]:
            ret[1]='1'
        if r1[i]==cp[2]:
            ret[2]='1'
    return ret

def check_f_real(cp):
    ret=['0','0','0']
    for i in range(len(r2)):
        if r2[i]==cp[0]:
            ret[0]='1'

        if r2[i]==cp[1]:
            ret[1]='1'

        if r2[i]==cp[2]:
            ret[2]='1'
    return ret

def det_direction(cd, ca, p):
    if ca ==['0','0','0']:
        return cd
    if ca[1] == '1' or (ca[0]=='1' and ca[2]=='1'):
        if cd=='n':
            return 's'
        else:
            if cd=='s':
                return 'n'
            else:
                if cd=='e':
                    return 'w'
                else:
                    if cd=='w':
                        return 'e'
    if ca[0]=='1':
            if cd=='n':
                if p[0] < 0:
                    return 's'
                return 'e'
            else:
                if cd=='s':
                    if p[0] >= n:
                        return 'n'
                    return 'w'
                else:
                    if cd=='e':
                        if p[1] < 0:
                            return 'w'
                        return 's'
                    else:
                        if cd=='w':
                            if p[1] >= n:
                                return 'e'
                            return 'n'
    if ca[2]=='1':
            if cd=='n':
                if p[0] < 0:
                    return 's'
                return 'w'
            else:
                if cd=='s':
                    if p[0] >= n:
                        return 'n'
                    return 'e'
                else:
                    if cd=='e':
                        if cd=='e':
                            if p[1] < 0:
                                return 'w'
                        return 'n'
                    else:
                        if cd=='w':
                            if p[1] >= n:
                                return 'e'
                            return 's'
                        
def advance(d, p):
    if d == 'n':
        if p[0]<= -1:
            return p
        p[0]-=1
        return p
    if d == 's':
        if p[0]>=n:
            return p
        p[0]+=1
        return p
    if d == 'e':
        if p[1]>=n:
            return p
        p[1]+=1
        return p
    if d == 'w':
        p[1]-=1
        return p
    
def check_ahead(d,p):
 
    if d=='n':
        if p[0]<=-1:
            return ['f',[p[0]+1,p[1]]]
        l=[p[0]-1,p[1]-1]
        c=[p[0]-1,p[1]]
        r=[p[0]-1,p[1]+1]
    if d=='s':
        if p[0]>=n:
            return ['f',[p[0]-1,p[1]]]
        r=[p[0]+1,p[1]-1]
        c=[p[0]+1,p[1]]
        l=[p[0]+1,p[1]+1]
    if d=='e':
        if p[1]>=n:
            return ['f',[p[0],p[1]+1]]
        l=[p[0]-1,p[1]+1]
        c=[p[0],p[1]+1]
        r=[p[0]+1,p[1]+1]
    if d=='w':
        if p[1]<=-1:
            return ['f',[p[0],p[1]-1]]
        l=[p[0]+1,p[1]-1]
        c=[p[0],p[1]-1]
        r=[p[0]-1,p[1]-1]
    return (l,c,r)

def c(row,col):
    rowcol= str(row) + "," + str(col)
    if rowcol in foxes:
        field[row+1][col].configure(bg="tan")
        foxes.remove(rowcol)
        r1.remove([row,col])
    else:
        field[row+1][col].configure(bg="green")
        foxes.add(rowcol)
        r1.append([row,col])
  
def show_terrorists():
    global hits
    #print("in clear_paths")
    for i in range(len(r2)):
        print("~~~~~")
        print(r2[i])
        print("~~~~~")
        field[r2[i][0]+1][r2[i][1]].configure(bg="black")
        for j in range(len(r1)):
            print("------")
            print(r1[j])
            if r2[i][0]==r1[j][0] and r2[i][1]==r1[j][1]:
                hits=hits+1
                field[r2[i][0]+1][r2[i][1]].configure(bg="red")
                print("Hit")
    hitsCntLabel=Label(root,text=str(hits) + " Terror Cells Destroyed")
    hitsCntLabel.grid(row=9,column=n+4) 
    hitsCntLabel=Label(root,text=str(Foxes - hits) + " Terror Cells Remain")
    hitsCntLabel.grid(row=11,column=n+4) 
           
def clear_paths():
    #print("in clear_paths")
    for i in range(n):
        for j in range(n):
            rowcol= str(i) + "," + str(j)
            #print(rowcol)
            if rowcol in foxes:
                field[i+1][j].configure(bg="green")
            else:
                field[i+1][j].configure(bg="tan")

def testRun(event,testRow,testCol):
    testRowCol= str(testRow) + "," + str(testCol)
    if testRowCol not in realrunscolor:
        return
    global d
    if testRow == -1:
        d='s'
    else:
        if testCol == -1:
            d='e'
        else:
            if testRow == n:
                d='n'
            else:
                if testCol == n:
                    d='w'
    if d == 's':
       label="N"+str(testCol)
    else:
       if d=='n':
           label="S"+str(testCol)
       else:
           if d=='e':
              label="W"+str(testRow)
           else:
              label="E"+str(testRow)
    p.append(testRow)
    p.append(testCol)
    ck=check_ahead(d,p)  
    thisRun=[]
    if label in pathList.keys():
        for i in range(len(pathList[label])):
           r_int=int(pathList[label][i][:pathList[label][i].index(',')])
           c_int=int(pathList[label][i][pathList[label][i].index(',')+1:])
           field[r_int+1][c_int].configure(bg="tan")
        pathList.pop(label)
        thisRun.clear()
        p.clear()
        return
    while 1:
        if ck[0] == 'f':
            break
        d=det_direction(d,check_f(ck),p)
        advance(d,p)
        coords=str(p[0])+","+str(p[1])
        if  (p[0] >-1 and p[0] < 30 and p[1] < 30 and p[1] > -1  ):
             field[p[0]+1][p[1]].configure(bg="orange")
             thisRun.append(coords)         
        ck=check_ahead(d,p)
    pathList[label]=thisRun.copy()
    thisRun.clear() 
    p.clear()
      
def realRun(event,row,col):
    global droneCnt

    rowcol= str(row) + "," + str(col)
    print(rowcol)
    if rowcol in ("-1,-1","-1,"+str(n),str(n)+",-1",str(n)+","+str(n)):
        return
    
    if droneCnt == n :
        return 
        
    if rowcol in realrunscolor:
        return
    droneCnt=droneCnt+1
    droneCntLabel=Label(root,text=str(droneCnt) + " of " + str(drones) + " Drones Launched")
    droneCntLabel.grid(row=7,column=n+4)
    global d
    if row == -1:
        d='s'
    else:
        if col == -1:
            d='e'
        else:
            if row == n:
                d='n'
            else:
                if col == n:
                    d='w'
    entries[rowcol].configure(bg="orange")
    if d == 's':
        label="N"+str(col)
    else:
        if d=='n':
            label="S"+str(col)
        else:
            if d=='e':
                label="W"+str(row)
            else:
                label="E"+str(row)
        
    entries[rowcol].configure(text=label)
    realrunscolor[rowcol]="orange"
    p.append(row)
    p.append(col)
    ck=check_ahead(d,p)  
    while 1:
        if ck[0] == 'f':
            break
        d=det_direction(d,check_f_real(ck),p)
        advance(d,p)
        ck=check_ahead(d,p)
        if p[0] < -1 :
            print ("p[0] is :" + str(p[0]))
        if p[1] < -1 :
            print ("p[1] is :" + str(p[1]))
        if p[0] > 30 :
             print ("p[0] is :" + str(p[0]))
        if p[1] > 30 :
                 print ("p[1] is :" + str(p[1]))
    rowcolt= str(p[0]) + "," + str(p[1])
    entries[rowcolt].configure(bg="orange") 
    entries[rowcolt].configure(text=label)
    realrunscolor[rowcolt]="orange"
    p.clear()
    


#Main    
gen_foxes()  
droneCnt=0
root.geometry('1250x850')  
for i in range(-1,n+1):
      for j in range(-1,n+1):
          rowcol= str(i) + "," + str(j)
          if j == -1 and rowcol not in dedup:
             b = Button(root, height= 1, width=3,text="",bg="grey",fg="black")
             b.bind("<Button-1>", lambda event=0, row=i,col=j :realRun(event,row,col))
             b.bind("<Button-3>", lambda event=0, row=i,col=j : testRun(event,row,col))
             b.grid(row=i+2,column=j+2),
             entries[rowcol]=b
             dedup.add(rowcol)
          if i == -1 and rowcol not in dedup:
             b = Button(root,height= 1, width=3, text="",bg="grey",fg="black")
             b.bind("<Button-1>", lambda event=0, row=i,col=j :realRun(event,row,col))
             b.bind("<Button-3>", lambda event=0, row=i,col=j : testRun(event,row,col))
             b.grid(row=i+2,column=j+2)
             entries[rowcol]=b
             dedup.add(rowcol)
          if j == n and rowcol not in dedup:
             b = Button(root,height= 1, width=3, text="",bg="grey",fg="black")
             b.bind("<Button-1>", lambda event=0, row=i,col=j :realRun(event,row,col))
             b.bind("<Button-3>", lambda event=0, row=i,col=j : testRun(event,row,col))
             b.grid(row=i+2,column=j+2)
             entries[rowcol]=b
             dedup.add(rowcol)
          if i == n and rowcol not in dedup:
             b = Button(root,height= 1, width=3, text="",bg="grey",fg="black")
             b.bind("<Button-1>", lambda event=0, row=i,col=j :realRun(event,row,col))
             b.bind("<Button-3>", lambda event=0, row=i,col=j : testRun(event,row,col))
             b.grid(row=i+2,column=j+2)
             entries[rowcol]=b
             dedup.add(rowcol)
entries["-1,-1"]['state']=DISABLED
entries["-1,"+str(n)]['state']=DISABLED
entries[str(n)+",-1"]['state']=DISABLED
entries[str(n)+","+str(n)]['state']=DISABLED


for i in range(n):
    for j in range(n):
        pos=str(i) + "," + str(j)
        b = Button(root, height= 1, width=3,text="",bg="tan",fg="black",command=lambda  row=i,col=j: c(row,col))
        testrunscolor[str(i)+","+str(j)]="tan"
        b.grid(row=i+2,column=j+2)
        f1.append(b)
    field.append(f1)
    f1=[]
b = Button(root, height= 1, width=10,text="Clear Paths",bg="teal",fg="black",command= clear_paths)
b.grid(row=3,column=n+4)
b = Button(root, height= 1, width=10,text="Fire",bg="red",fg="black",command= show_terrorists)
b.grid(row=5,column=n+4)
droneCntLabel=Label(root,width=20,text=str(droneCnt) + " of " + str(drones) + " Drones Launched")
droneCntLabel.grid(row=7,column=n+4)

missionCntLabel=Label(root,width=25,text="Mission: Destroy " + str(Foxes) + " Terror Cells")
missionCntLabel.grid(row=1,column=n+4)

root.mainloop()




