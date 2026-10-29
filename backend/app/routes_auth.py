from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .db import get_db
from .models import Session, User
from .schemas import AuthOut, LoginIn, RegisterIn, UserOut
from .security import create_session, current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, db: DbSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    return AuthOut(token=create_session(db, user), user=UserOut.model_validate(user))


@router.post("/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, db: DbSession = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    user = User(email=body.email, name=body.name, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return AuthOut(token=create_session(db, user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    token = request.headers["Authorization"].removeprefix("Bearer ").strip()
    session = db.get(Session, token)
    if session:
        db.delete(session)
        db.commit()


@router.get("/users", response_model=list[UserOut])
def list_users(db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    """Everyone in the workspace. Used for the share picker autocomplete."""
    return db.scalars(select(User).where(User.id != user.id).order_by(User.name)).all()
